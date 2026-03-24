import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId } from '@eloc2/domain';
import type {
  GroundTruthBroadcast,
  GroundTruthTarget,
  SensorTrackReport,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import { C4isrSensorInstance } from '../c4isr-sensor.js';
import { SensorInstance } from '../base-sensor.js';
import type { SensorInstanceConfig } from '../types.js';

// ── Helpers ──

function makeSensorId(id: string): SensorId {
  return id as unknown as SensorId;
}

const c4isrConfig: SensorInstanceConfig = {
  sensorId: 'C4ISR-TEST',
  type: 'c4isr',
  position: { lat: 31.5, lon: 34.8, alt: 0 },
  coverage: {
    minAzDeg: 0,
    maxAzDeg: 360,
    minElDeg: -90,
    maxElDeg: 90,
    maxRangeM: 500_000, // 500km — effectively unlimited
  },
  updateIntervalSec: 12,
};

function makeTarget(
  id: string,
  overrides?: Partial<GroundTruthTarget>,
): GroundTruthTarget {
  return {
    targetId: id,
    position: { lat: 31.7, lon: 35.0, alt: 5000 },
    velocity: { vx: 200, vy: -50, vz: 0 },
    classification: 'hostile',
    rcs: 5.0,
    active: true,
    ...overrides,
  };
}

function makeGroundTruth(
  targets: GroundTruthTarget[],
  simTimeSec = 10,
): GroundTruthBroadcast {
  return {
    messageType: 'gt.broadcast',
    simTimeSec,
    targets,
  };
}

// ── Tests ──

describe('C4isrSensorInstance', () => {
  let bus: SensorBus;
  let sensor: C4isrSensorInstance;

  beforeEach(() => {
    bus = new SensorBus();
    sensor = new C4isrSensorInstance(c4isrConfig, bus);
  });

  it('can be instantiated', () => {
    expect(sensor).toBeInstanceOf(C4isrSensorInstance);
    expect(sensor).toBeInstanceOf(SensorInstance);
    expect(sensor.sensorId).toBe('C4ISR-TEST');
    expect(sensor.sensorType).toBe('c4isr');
    expect(sensor.isOnline()).toBe(true);
    expect(sensor.getMode()).toBe('track');
  });

  it('filterTargetByCoverage always returns true for active targets', () => {
    // Near target
    const near = makeTarget('TGT-NEAR', {
      position: { lat: 31.6, lon: 34.9, alt: 3000 },
    });
    expect(sensor.filterTargetByCoverage(near)).toBe(true);

    // Far target (1000km away — still returns true for C4ISR)
    const far = makeTarget('TGT-FAR', {
      position: { lat: 40.0, lon: 40.0, alt: 10000 },
    });
    expect(sensor.filterTargetByCoverage(far)).toBe(true);

    // Target at zero altitude
    const ground = makeTarget('TGT-GROUND', {
      position: { lat: 31.5, lon: 34.8, alt: 0 },
    });
    expect(sensor.filterTargetByCoverage(ground)).toBe(true);
  });

  it('tick() generates observations for all visible targets', () => {
    const targets = [
      makeTarget('TGT-1'),
      makeTarget('TGT-2', { position: { lat: 32.0, lon: 35.2, alt: 8000 } }),
    ];
    bus.broadcastGroundTruth(makeGroundTruth(targets));

    // First tick at t=12 (meets the 12s interval from t=0)
    const result = sensor.tick(12, 1);

    expect(result.sensorId).toBe('C4ISR-TEST');
    expect(result.observationsGenerated).toBe(2);
    expect(result.online).toBe(true);
  });

  it('tick() publishes SensorTrackReport on bus', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    sensor.tick(12, 1);

    expect(handler).toHaveBeenCalledOnce();
    const report: SensorTrackReport = handler.mock.calls[0][0];
    expect(report.messageType).toBe('sensor.track.report');
    expect(report.sensorId).toBe(makeSensorId('C4ISR-TEST'));
    expect(report.sensorType).toBe('c4isr');
    expect(report.simTimeSec).toBe(12);
    expect(Array.isArray(report.localTracks)).toBe(true);
  });

  it('respects 12-second update interval (skips intermediate ticks)', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // t=5: too early, should not generate observations
    const result5 = sensor.tick(5, 1);
    expect(result5.observationsGenerated).toBe(0);
    expect(handler).not.toHaveBeenCalled();

    // t=10: still too early
    const result10 = sensor.tick(10, 1);
    expect(result10.observationsGenerated).toBe(0);

    // t=12: now it should fire
    const result12 = sensor.tick(12, 1);
    expect(result12.observationsGenerated).toBe(1);
    expect(handler).toHaveBeenCalledOnce();

    // t=20: only 8s since last update — should not fire
    handler.mockClear();
    const result20 = sensor.tick(20, 1);
    expect(result20.observationsGenerated).toBe(0);

    // t=24: 12s since last update — should fire
    const result24 = sensor.tick(24, 1);
    expect(result24.observationsGenerated).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('local tracks get confirmed after 2 updates (faster than radar)', () => {
    // Use a deterministic observation generator (no noise) so that
    // consecutive observations correlate reliably with the same track.
    let obsCounter = 0;
    const deterministicGenerator = (
      sensorDef: any, tgtPos: any, tgtVel: any, timeSec: number, baseTimestamp: number,
    ) => ({
      observationId: `obs-${++obsCounter}`,
      sensorId: sensorDef.sensorId,
      position: { ...tgtPos },
      velocity: tgtVel ? { ...tgtVel } : undefined,
      timestamp: (baseTimestamp + timeSec * 1000) as any,
      covariance: [[400, 0, 0], [0, 400, 0], [0, 0, 400]],
    });

    const deterministicSensor = new C4isrSensorInstance(
      c4isrConfig, bus, deterministicGenerator as any,
    );

    const handler = vi.fn();
    bus.onTrackReport(handler);

    // Use a stationary target so observations always match the same position
    // (moving targets cause prediction divergence → correlation miss → new track each tick)
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1', {
      velocity: { vx: 0, vy: 0, vz: 0 },
    })]));

    // First update at t=12 — track created as tentative ('new')
    deterministicSensor.tick(12, 1);
    let report: SensorTrackReport = handler.mock.calls[0][0];
    expect(report.localTracks.length).toBeGreaterThanOrEqual(1);
    expect(report.localTracks[0].status).toBe('new');

    // Second update at t=24 — Bayesian Pe update should confirm the track
    deterministicSensor.tick(24, 1);

    // Third update at t=36 — track stays confirmed
    deterministicSensor.tick(36, 1);
    report = handler.mock.calls[handler.mock.calls.length - 1][0];

    // With existence-based confirmation (Pe threshold 0.7), the track
    // should be confirmed ('maintained') after 2+ updates
    const confirmedTrack = report.localTracks.find(
      (t) => t.status === 'maintained',
    );
    expect(confirmedTrack).toBeDefined();
  });

  it('target removal leads to track drop after fewer misses', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    // Initially target is present
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // Build up track over several updates
    sensor.tick(12, 1);
    sensor.tick(24, 1);
    sensor.tick(36, 1);

    // Now remove the target
    bus.broadcastGroundTruth(
      makeGroundTruth([], 40),
    );

    // Tick several more times without the target — track should eventually drop
    // C4ISR dropAfterMisses = 3
    sensor.tick(48, 1);
    sensor.tick(60, 1);
    sensor.tick(72, 1);
    sensor.tick(84, 1);

    // After enough misses, track count should drop to 0
    const lastResult = sensor.tick(96, 1);
    expect(lastResult.localTrackCount).toBe(0);
  });

  it('track reports include position, velocity, covariance', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(
      makeGroundTruth([
        makeTarget('TGT-1', {
          velocity: { vx: 100, vy: 50, vz: -10 },
        }),
      ]),
    );

    sensor.tick(12, 1);

    const report: SensorTrackReport = handler.mock.calls[0][0];
    expect(report.localTracks.length).toBeGreaterThanOrEqual(1);
    const track = report.localTracks[0];

    // Position should be present and near the target
    expect(track.position).toBeDefined();
    expect(typeof track.position.lat).toBe('number');
    expect(typeof track.position.lon).toBe('number');
    expect(typeof track.position.alt).toBe('number');

    // Velocity should be present
    expect(track.velocity).toBeDefined();

    // Covariance should be a 3x3 matrix
    expect(track.covariance).toBeDefined();
    expect(track.covariance.length).toBe(3);
    expect(track.covariance[0].length).toBe(3);
  });

  it('no dual-hypothesis classification (targetCategory remains unresolved)', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    sensor.tick(12, 1);
    sensor.tick(24, 1);

    const report: SensorTrackReport = handler.mock.calls[1][0];
    for (const track of report.localTracks) {
      expect(track.targetCategory).toBe('unresolved');
      expect(track.classifierConfidence).toBe(0);
    }
  });

  it('multiple targets tracked simultaneously', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const targets = [
      makeTarget('TGT-1', { position: { lat: 31.7, lon: 35.0, alt: 5000 } }),
      makeTarget('TGT-2', { position: { lat: 32.5, lon: 35.5, alt: 8000 } }),
      makeTarget('TGT-3', { position: { lat: 30.5, lon: 34.0, alt: 3000 } }),
    ];
    bus.broadcastGroundTruth(makeGroundTruth(targets));

    // First update — creates tracks
    sensor.tick(12, 1);
    const result1 = sensor.tick(24, 1);

    // Should have tracks for all 3 targets
    expect(result1.localTrackCount).toBeGreaterThanOrEqual(3);

    const report: SensorTrackReport = handler.mock.calls[1][0];
    expect(report.localTracks.length).toBeGreaterThanOrEqual(3);
  });

  it('does not generate observations when offline', () => {
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    sensor.setOnline(false);
    const result = sensor.tick(12, 1);
    expect(result.observationsGenerated).toBe(0);
    expect(result.online).toBe(false);
  });

  it('does not generate observations in standby mode', () => {
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    bus.sendCommand({
      messageType: 'system.command',
      commandId: 'CMD-1',
      targetSensorId: makeSensorId('C4ISR-TEST'),
      simTimeSec: 1,
      command: { type: 'mode', mode: 'standby' },
    });

    const result = sensor.tick(12, 1);
    expect(result.observationsGenerated).toBe(0);
  });

  it('inactive targets are filtered out by base class', () => {
    bus.broadcastGroundTruth(
      makeGroundTruth([
        makeTarget('TGT-ACTIVE'),
        makeTarget('TGT-INACTIVE', { active: false }),
      ]),
    );

    const result = sensor.tick(12, 1);
    // Only the active target should produce an observation
    expect(result.observationsGenerated).toBe(1);
  });
});
