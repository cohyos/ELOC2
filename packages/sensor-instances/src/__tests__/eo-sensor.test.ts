import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId } from '@eloc2/domain';
import type {
  GroundTruthBroadcast,
  GroundTruthTarget,
  BearingReport,
  SystemCommand,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import { EoSensorInstance } from '../eo-sensor.js';
import type { SensorInstanceConfig } from '../types.js';

// ── Helpers ──

const eoConfig: SensorInstanceConfig = {
  sensorId: 'EO-TEST',
  type: 'eo',
  position: { lat: 31.5, lon: 34.8, alt: 50 },
  coverage: {
    minAzDeg: 0,
    maxAzDeg: 360,
    minElDeg: -10,
    maxElDeg: 60,
    maxRangeM: 30_000,
  },
  fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
  slewRateDegPerSec: 60,
  updateIntervalSec: 2,
};

function makeTarget(
  id: string,
  overrides?: Partial<GroundTruthTarget>,
): GroundTruthTarget {
  return {
    targetId: id,
    position: { lat: 31.6, lon: 34.9, alt: 5000 }, // ~15km away
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

describe('EoSensorInstance', () => {
  let bus: SensorBus;
  let sensor: EoSensorInstance;

  beforeEach(() => {
    bus = new SensorBus();
    sensor = new EoSensorInstance(eoConfig, bus);
  });

  it('can be instantiated', () => {
    expect(sensor).toBeInstanceOf(EoSensorInstance);
    expect(sensor.sensorId).toBe('EO-TEST');
    expect(sensor.sensorType).toBe('eo');
  });

  it('receives GT broadcast and filters targets by coverage (range)', () => {
    const inRange = makeTarget('TGT-IN', {
      position: { lat: 31.6, lon: 34.9, alt: 5000 }, // ~15km
    });
    const outOfRange = makeTarget('TGT-OUT', {
      position: { lat: 35.0, lon: 38.0, alt: 5000 }, // >400km
    });

    expect(sensor.filterTargetByCoverage(inRange)).toBe(true);
    expect(sensor.filterTargetByCoverage(outOfRange)).toBe(false);
  });

  it('tick() generates bearing observations for visible targets', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    const result = sensor.tick(2, 2);

    expect(result.observationsGenerated).toBeGreaterThanOrEqual(1);
    expect(handler).toHaveBeenCalled();
  });

  it('tick() publishes BearingReport (not SensorTrackReport) on bus', () => {
    const bearingHandler = vi.fn();
    const trackHandler = vi.fn();
    bus.onBearingReport(bearingHandler);
    bus.onTrackReport(trackHandler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    sensor.tick(2, 2);

    expect(bearingHandler).toHaveBeenCalled();
    expect(trackHandler).not.toHaveBeenCalled();
  });

  it('BearingReport has correct fields (azimuth, elevation, sensorPosition, gimbalState)', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    sensor.tick(2, 2);

    const report: BearingReport = handler.mock.calls[0][0];
    expect(report.messageType).toBe('sensor.bearing.report');
    expect(report.sensorId).toBe('EO-TEST');
    expect(report.bearings.length).toBeGreaterThanOrEqual(1);

    const b = report.bearings[0];
    expect(b.bearing.azimuthDeg).toBeTypeOf('number');
    expect(b.bearing.elevationDeg).toBeTypeOf('number');
    expect(b.sensorPosition.lat).toBe(31.5);
    expect(b.sensorPosition.lon).toBe(34.8);
    expect(b.imageQuality).toBeGreaterThan(0);

    expect(report.gimbalState).toBeDefined();
    expect(report.gimbalState.azimuthDeg).toBeTypeOf('number');
    expect(report.gimbalState.slewRateDegPerSec).toBe(60);
  });

  it('handles CueCommand — stores cue, sets investigating mode', () => {
    const cueCmd: SystemCommand = {
      messageType: 'system.command',
      commandId: 'cmd-1',
      targetSensorId: 'EO-TEST' as SensorId,
      simTimeSec: 5,
      command: {
        type: 'cue',
        systemTrackId: 'SYS-T1',
        predictedPosition: { lat: 31.7, lon: 35.0, alt: 5000 },
        uncertaintyGateDeg: 5,
        priority: 8,
      },
    };

    bus.sendCommand(cueCmd);

    expect(sensor.getEoMode()).toBe('investigating');
    expect(sensor.getActiveCue()).not.toBeNull();
    expect(sensor.getActiveCue()!.systemTrackId).toBe('SYS-T1');
  });

  it('gimbal slews toward cue target position', () => {
    const initialAz = sensor.getGimbalAzimuthDeg();

    // Send cue to a target roughly northeast
    const cueCmd: SystemCommand = {
      messageType: 'system.command',
      commandId: 'cmd-2',
      targetSensorId: 'EO-TEST' as SensorId,
      simTimeSec: 5,
      command: {
        type: 'cue',
        systemTrackId: 'SYS-T1',
        predictedPosition: { lat: 31.7, lon: 35.0, alt: 5000 },
        uncertaintyGateDeg: 5,
        priority: 8,
      },
    };

    bus.sendCommand(cueCmd);
    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // Tick to trigger gimbal update
    sensor.tick(2, 2);

    const newAz = sensor.getGimbalAzimuthDeg();
    // Gimbal should have moved from initial position
    expect(newAz).not.toBe(initialAz);
  });

  it('handles SearchPatternCommand — sector scan', () => {
    const searchCmd: SystemCommand = {
      messageType: 'system.command',
      commandId: 'cmd-3',
      targetSensorId: 'EO-TEST' as SensorId,
      simTimeSec: 5,
      command: {
        type: 'search_pattern',
        pattern: 'sector',
        azimuthStartDeg: 45,
        azimuthEndDeg: 135,
        scanSpeedDegPerSec: 10,
      },
    };

    bus.sendCommand(searchCmd);

    expect(sensor.getEoMode()).toBe('staring');
    expect(sensor.getActiveCue()).toBeNull();

    // Tick to advance the scan
    bus.broadcastGroundTruth(makeGroundTruth([]));
    sensor.tick(2, 2);

    const az = sensor.getGimbalAzimuthDeg();
    // Should be somewhere in the search pattern range
    expect(az).toBeGreaterThanOrEqual(45);
    expect(az).toBeLessThanOrEqual(135);
  });

  it('out-of-range targets produce no bearings', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    const farTarget = makeTarget('TGT-FAR', {
      position: { lat: 35.0, lon: 38.0, alt: 5000 }, // >400km
    });
    bus.broadcastGroundTruth(makeGroundTruth([farTarget]));
    const result = sensor.tick(2, 2);

    expect(result.observationsGenerated).toBe(0);
  });

  it('respects 2-second update interval', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));

    // First tick at t=2 should generate
    const r1 = sensor.tick(2, 2);
    expect(r1.observationsGenerated).toBeGreaterThanOrEqual(1);

    // Tick at t=3 — less than 2s elapsed, should skip
    const r2 = sensor.tick(3, 1);
    expect(r2.observationsGenerated).toBe(0);

    // Tick at t=4 — 2s elapsed, should generate again
    const r3 = sensor.tick(4, 2);
    expect(r3.observationsGenerated).toBeGreaterThanOrEqual(1);
  });

  it('mode command switches to standby — no observations generated', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    // Set to standby
    bus.sendCommand({
      messageType: 'system.command',
      commandId: 'cmd-4',
      targetSensorId: 'EO-TEST' as SensorId,
      simTimeSec: 1,
      command: { type: 'mode', mode: 'standby' },
    });

    bus.broadcastGroundTruth(makeGroundTruth([makeTarget('TGT-1')]));
    const result = sensor.tick(2, 2);

    expect(result.observationsGenerated).toBe(0);
    expect(result.online).toBe(true); // Still online, just in standby
  });
});
