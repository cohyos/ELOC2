import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SensorBus } from '../bus.js';
import type {
  SensorTrackReport,
  BearingReport,
  SystemCommand,
  GroundTruthBroadcast,
} from '../types.js';
import type { SensorId, Timestamp, Covariance3x3 } from '@eloc2/domain';

// ── Helpers ──

const sensorId = (id: string) => id as SensorId;
const timestamp = (t: number) => t as Timestamp;

const zeroCov: Covariance3x3 = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

function makeTrackReport(sid: string, overrides?: Partial<SensorTrackReport>): SensorTrackReport {
  return {
    messageType: 'sensor.track.report',
    sensorId: sensorId(sid),
    sensorType: 'radar',
    timestamp: timestamp(1000),
    simTimeSec: 10,
    localTracks: [
      {
        localTrackId: 'LT-1',
        sensorId: sensorId(sid),
        position: { lat: 32.0, lon: 34.8, alt: 5000 },
        velocity: { vx: 100, vy: 0, vz: 0 },
        covariance: zeroCov,
        confidence: 0.9,
        status: 'maintained',
        updateCount: 5,
        missCount: 0,
        existenceProbability: 0.95,
        targetCategory: 'abt',
        classifierConfidence: 0.8,
        lastObservationTime: 10,
        positionHistory: [{ lat: 32.0, lon: 34.8, alt: 5000, timeSec: 10 }],
      },
    ],
    sensorStatus: {
      sensorId: sensorId(sid),
      sensorType: 'radar',
      online: true,
      mode: 'track',
      trackCount: 1,
    },
    ...overrides,
  };
}

function makeBearingReport(sid: string): BearingReport {
  return {
    messageType: 'sensor.bearing.report',
    sensorId: sensorId(sid),
    timestamp: timestamp(1000),
    simTimeSec: 10,
    bearings: [
      {
        bearing: { azimuthDeg: 45, elevationDeg: 5, timestamp: timestamp(1000) },
        targetId: 'TGT-1',
        imageQuality: 0.85,
        sensorPosition: { lat: 31.5, lon: 34.5, alt: 100 },
      },
    ],
    gimbalState: {
      azimuthDeg: 45,
      elevationDeg: 5,
      slewRateDegPerSec: 30,
      currentTargetId: 'TGT-1',
    },
  };
}

function makeCommand(targetSid: string): SystemCommand {
  return {
    messageType: 'system.command',
    commandId: 'CMD-001',
    targetSensorId: sensorId(targetSid),
    simTimeSec: 10,
    command: {
      type: 'cue',
      systemTrackId: 'ST-1',
      predictedPosition: { lat: 32.0, lon: 34.8, alt: 5000 },
      uncertaintyGateDeg: 2.0,
      priority: 1,
    },
  };
}

function makeGroundTruth(): GroundTruthBroadcast {
  return {
    messageType: 'gt.broadcast',
    simTimeSec: 10,
    targets: [
      {
        targetId: 'TGT-1',
        position: { lat: 32.0, lon: 34.8, alt: 5000 },
        velocity: { vx: 100, vy: 0, vz: 0 },
        classification: 'hostile',
        rcs: 1.5,
        active: true,
      },
    ],
  };
}

// ── Tests ──

describe('SensorBus', () => {
  let bus: SensorBus;

  beforeEach(() => {
    bus = new SensorBus();
  });

  afterEach(() => {
    bus.destroy();
  });

  it('can be instantiated', () => {
    expect(bus).toBeInstanceOf(SensorBus);
  });

  // ── Track Reports ──

  it('delivers track reports to subscribers', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const report = makeTrackReport('R-1');
    bus.publishTrackReport(report);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(report);
  });

  it('delivers track report with correct data', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);

    const report = makeTrackReport('R-1');
    bus.publishTrackReport(report);

    const received = handler.mock.calls[0][0] as SensorTrackReport;
    expect(received.messageType).toBe('sensor.track.report');
    expect(received.sensorId).toBe('R-1');
    expect(received.localTracks).toHaveLength(1);
    expect(received.localTracks[0].localTrackId).toBe('LT-1');
    expect(received.sensorStatus.online).toBe(true);
  });

  // ── Bearing Reports ──

  it('delivers bearing reports to subscribers', () => {
    const handler = vi.fn();
    bus.onBearingReport(handler);

    const report = makeBearingReport('EO-1');
    bus.publishBearingReport(report);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(report);
  });

  // ── Commands ──

  it('delivers commands to the targeted sensor only', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bus.onCommand('SENSOR-A', handlerA);
    bus.onCommand('SENSOR-B', handlerB);

    const cmd = makeCommand('SENSOR-A');
    bus.sendCommand(cmd);

    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerA).toHaveBeenCalledWith(cmd);
    expect(handlerB).not.toHaveBeenCalled();
  });

  it('delivers commands to the global command monitor', () => {
    const handler = vi.fn();
    bus.onAnyCommand(handler);

    const cmd = makeCommand('SENSOR-X');
    bus.sendCommand(cmd);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(cmd);
  });

  // ── Ground Truth ──

  it('delivers ground truth to all subscribers', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.onGroundTruth(handler1);
    bus.onGroundTruth(handler2);

    const gt = makeGroundTruth();
    bus.broadcastGroundTruth(gt);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler1).toHaveBeenCalledWith(gt);
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledWith(gt);
  });

  // ── Per-sensor channel routing ──

  it('routes track reports to per-sensor subscribers', () => {
    const globalHandler = vi.fn();
    const sensorHandler = vi.fn();
    const otherSensorHandler = vi.fn();

    bus.onTrackReport(globalHandler);
    bus.onTrackReportFrom('R-1', sensorHandler);
    bus.onTrackReportFrom('R-2', otherSensorHandler);

    const report = makeTrackReport('R-1');
    bus.publishTrackReport(report);

    expect(globalHandler).toHaveBeenCalledOnce();
    expect(sensorHandler).toHaveBeenCalledOnce();
    expect(otherSensorHandler).not.toHaveBeenCalled();
  });

  it('routes bearing reports to per-sensor subscribers', () => {
    const globalHandler = vi.fn();
    const sensorHandler = vi.fn();
    const otherHandler = vi.fn();

    bus.onBearingReport(globalHandler);
    bus.onBearingReportFrom('EO-1', sensorHandler);
    bus.onBearingReportFrom('EO-2', otherHandler);

    const report = makeBearingReport('EO-1');
    bus.publishBearingReport(report);

    expect(globalHandler).toHaveBeenCalledOnce();
    expect(sensorHandler).toHaveBeenCalledOnce();
    expect(otherHandler).not.toHaveBeenCalled();
  });

  // ── Lifecycle ──

  it('destroy removes all listeners', () => {
    const handler = vi.fn();
    bus.onTrackReport(handler);
    bus.onBearingReport(handler);
    bus.onGroundTruth(handler);

    bus.destroy();

    // After destroy, publishing should not trigger handlers
    bus.publishTrackReport(makeTrackReport('R-1'));
    bus.publishBearingReport(makeBearingReport('EO-1'));
    bus.broadcastGroundTruth(makeGroundTruth());

    expect(handler).not.toHaveBeenCalled();
  });

  // ── Multiple subscribers ──

  it('multiple subscribers all receive the same track report', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    bus.onTrackReport(handler1);
    bus.onTrackReport(handler2);
    bus.onTrackReport(handler3);

    const report = makeTrackReport('R-1');
    bus.publishTrackReport(report);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();

    // All receive the same object reference
    expect(handler1.mock.calls[0][0]).toBe(report);
    expect(handler2.mock.calls[0][0]).toBe(report);
    expect(handler3.mock.calls[0][0]).toBe(report);
  });
});
