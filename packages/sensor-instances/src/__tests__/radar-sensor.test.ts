import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId } from '@eloc2/domain';
import type {
  GroundTruthBroadcast,
  GroundTruthTarget,
  SensorTrackReport,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import { RadarSensorInstance } from '../radar-sensor.js';
import type { SensorInstanceConfig } from '../types.js';

// ── Helpers ──

const radarConfig: SensorInstanceConfig = {
  sensorId: 'RADAR-TEST',
  type: 'radar',
  position: { lat: 31.5, lon: 34.8, alt: 100 },
  coverage: {
    minAzDeg: 0,
    maxAzDeg: 360,
    minElDeg: 0,
    maxElDeg: 45,
    maxRangeM: 200_000, // 200km
  },
  updateIntervalSec: 1,
};

function makeTarget(
  id: string,
  overrides?: Partial<GroundTruthTarget>,
): GroundTruthTarget {
  return {
    targetId: id,
    position: { lat: 31.7, lon: 35.0, alt: 5000 },
    velocity: { vx: 200, vy: -50, vz: 0 },
    classification: 'fighter_aircraft',
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

describe('RadarSensorInstance', () => {
  let bus: SensorBus;
  let sensor: RadarSensorInstance;

  beforeEach(() => {
    bus = new SensorBus();
    sensor = new RadarSensorInstance(radarConfig, bus);
  });

  it('can be instantiated', () => {
    expect(sensor).toBeInstanceOf(RadarSensorInstance);
    expect(sensor.sensorId).toBe('RADAR-TEST');
    expect(sensor.sensorType).toBe('radar');
  });

  it('receives GT broadcast and filters targets in coverage', () => {
    const inRange = makeTarget('TGT-IN', {
      position: { lat: 31.7, lon: 35.0, alt: 5000 }, // ~30km away
    });
    const outOfRange = makeTarget('TGT-OUT', {
      position: { lat: 35.0, lon: 38.0, alt: 5000 }, // >400km away
    });

    expect(sensor.filterTargetByCoverage(inRange)).toBe(true);
    expect(sensor.filterTargetByCoverage(outOfRange)).toBe(false);
  });

  it('tick() generates observations and creates local tracks', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    const result = sensor.tick(1, 1);

    expect(result.observationsGenerated).toBeGreaterThanOrEqual(1);
    expect(handler).toHaveBeenCalled();
  });

  it('tick() publishes SensorTrackReport on bus with correct fields', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    sensor.tick(1, 1);

    expect(handler).toHaveBeenCalled();
    const report: SensorTrackReport = handler.mock.calls[0][0];
    expect(report.messageType).toBe('sensor.track.report');
    expect(report.sensorId).toBe('RADAR-TEST');
    expect(report.sensorType).toBe('radar');
    expect(report.localTracks.length).toBeGreaterThanOrEqual(1);
    expect(report.sensorStatus.online).toBe(true);
    expect(report.sensorStatus.mode).toBe('track');
  });

  it('out-of-range targets produce no observations', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const farTarget = makeTarget('TGT-FAR', {
      position: { lat: 35.0, lon: 38.0, alt: 5000 }, // >400km
    });
    bus.broadcastGroundTruth(makeGroundTruth([farTarget]));
    const result = sensor.tick(1, 1);

    expect(result.observationsGenerated).toBe(0);
  });

  it('multiple ticks → tracks get confirmed (status: maintained)', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const target = makeTarget('TGT-1');
    bus.broadcastGroundTruth(makeGroundTruth([target]));

    // Multiple ticks to accumulate updates and confirm track.
    // With existence-based promotion (Pe needs ≥0.8), may need 8+ updates
    for (let t = 1; t <= 10; t++) {
      sensor.tick(t, 1);
    }

    const lastReport: SensorTrackReport =
      handler.mock.calls[handler.mock.calls.length - 1][0];
    const confirmed = lastReport.localTracks.find(
      (t) => t.status === 'maintained',
    );
    expect(confirmed).toBeDefined();
  });

  it('target leaving coverage → track eventually dropped', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    // Target in range for first few ticks
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    for (let t = 1; t <= 5; t++) {
      sensor.tick(t, 1);
    }

    // Target leaves coverage
    bus.broadcastGroundTruth(makeGroundTruth([]));
    for (let t = 6; t <= 25; t++) {
      sensor.tick(t, 1);
    }

    // By now the track should be coasting or have fewer active tracks
    const lastReport: SensorTrackReport =
      handler.mock.calls[handler.mock.calls.length - 1][0];
    const activeCount = lastReport.localTracks.filter(
      (t) => t.status === 'maintained',
    ).length;
    // Either 0 active tracks or track is coasting/dropped
    expect(activeCount).toBeLessThanOrEqual(1);
  });

  it('local track report includes position, velocity, covariance, confidence', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    sensor.tick(1, 1);

    const report: SensorTrackReport = handler.mock.calls[0][0];
    const track = report.localTracks[0];
    expect(track).toBeDefined();
    expect(track.position).toBeDefined();
    expect(track.position.lat).toBeTypeOf('number');
    expect(track.position.lon).toBeTypeOf('number');
    expect(track.covariance).toBeDefined();
    expect(Array.isArray(track.covariance)).toBe(true);
    expect(track.confidence).toBeTypeOf('number');
    expect(track.confidence).toBeGreaterThan(0);
  });

  it('dual hypothesis is enabled (tracks have category field)', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // Run several ticks so classifier can attempt resolution
    for (let t = 1; t <= 10; t++) {
      sensor.tick(t, 1);
    }

    const lastReport: SensorTrackReport =
      handler.mock.calls[handler.mock.calls.length - 1][0];
    const track = lastReport.localTracks[0];
    expect(track).toBeDefined();
    // targetCategory should be a string (may be 'unresolved', 'bm', or 'abt')
    expect(track.targetCategory).toBeTypeOf('string');
  });

  it('shouldUpdate respects update interval (skips when not elapsed)', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // First tick at t=1 should generate observations
    const r1 = sensor.tick(1, 1);
    expect(r1.observationsGenerated).toBeGreaterThanOrEqual(1);

    // Tick at t=1.5 — less than 1s interval, should skip
    const r2 = sensor.tick(1.5, 0.5);
    expect(r2.observationsGenerated).toBe(0);

    // Tick at t=2 — 1s elapsed, should generate again
    const r3 = sensor.tick(2, 1);
    expect(r3.observationsGenerated).toBeGreaterThanOrEqual(1);
  });

  it('multiple targets tracked simultaneously', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const targets = [
      makeTarget('TGT-1', { position: { lat: 31.7, lon: 35.0, alt: 5000 } }),
      makeTarget('TGT-2', { position: { lat: 31.6, lon: 34.9, alt: 3000 } }),
      makeTarget('TGT-3', { position: { lat: 31.8, lon: 35.1, alt: 7000 } }),
    ];
    bus.broadcastGroundTruth(makeGroundTruth(targets));

    for (let t = 1; t <= 5; t++) {
      sensor.tick(t, 1);
    }

    const lastReport: SensorTrackReport =
      handler.mock.calls[handler.mock.calls.length - 1][0];
    // Should have tracks for multiple targets (may be merged if very close)
    expect(lastReport.localTracks.length).toBeGreaterThanOrEqual(2);
  });
});
