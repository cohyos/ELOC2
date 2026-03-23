import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SensorBus } from '../bus.js';
import type {
  SensorTrackReport,
  BearingReport,
  SystemCommand,
  GroundTruthBroadcast,
} from '../types.js';
import type { SensorId, Timestamp } from '@eloc2/domain';

// ── Helpers ──

function makeSensorId(id: string): SensorId {
  return id as unknown as SensorId;
}

function makeTimestamp(ms: number): Timestamp {
  return ms as unknown as Timestamp;
}

function makeTrackReport(sensorId: string): SensorTrackReport {
  const sid = makeSensorId(sensorId);
  return {
    messageType: 'sensor.track.report',
    sensorId: sid,
    sensorType: 'radar',
    timestamp: makeTimestamp(Date.now()),
    simTimeSec: 10,
    localTracks: [
      {
        localTrackId: 'LT-1',
        sensorId: sid,
        position: { lat: 31.5, lon: 34.5, alt: 5000 },
        velocity: { vx: 100, vy: 0, vz: 0 },
        covariance: [
          [100, 0, 0],
          [0, 100, 0],
          [0, 0, 100],
        ],
        confidence: 0.9,
        status: 'maintained',
        updateCount: 5,
        missCount: 0,
        existenceProbability: 0.95,
        targetCategory: 'abt',
        classifierConfidence: 0.8,
        lastObservationTime: 10,
        positionHistory: [{ lat: 31.5, lon: 34.5, alt: 5000, timeSec: 10 }],
      },
    ],
    sensorStatus: {
      sensorId: sid,
      sensorType: 'radar',
      online: true,
      mode: 'track',
      trackCount: 1,
      registrationHealth: 'good',
    },
  };
}

function makeBearingReport(sensorId: string): BearingReport {
  return {
    messageType: 'sensor.bearing.report',
    sensorId: makeSensorId(sensorId),
    timestamp: makeTimestamp(Date.now()),
    simTimeSec: 12,
    bearings: [
      {
        bearing: {
          sensorId: makeSensorId(sensorId),
          azimuthDeg: 45.0,
          elevationDeg: 5.0,
          timestamp: makeTimestamp(Date.now()),
        },
        targetId: 'T-1',
        imageQuality: 0.85,
        sensorPosition: { lat: 31.0, lon: 34.0, alt: 100 },
      },
    ],
    gimbalState: {
      azimuthDeg: 45.0,
      elevationDeg: 5.0,
      slewRateDegPerSec: 30,
      currentTargetId: 'T-1',
    },
  };
}

function makeCommand(targetSensorId: string): SystemCommand {
  return {
    messageType: 'system.command',
    commandId: 'CMD-001',
    targetSensorId: makeSensorId(targetSensorId),
    simTimeSec: 15,
    command: {
      type: 'cue',
      systemTrackId: 'ST-1',
      predictedPosition: { lat: 31.5, lon: 34.5, alt: 5000 },
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
        targetId: 'GT-1',
        position: { lat: 31.5, lon: 34.5, alt: 5000 },
        velocity: { vx: 100, vy: 0, vz: 0 },
        classification: 'hostile',
        rcs: 5.0,
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

  it('can be instantiated', () => {
    expect(bus).toBeInstanceOf(SensorBus);
  });

  describe('track reports', () => {
    it('publish → subscriber receives with correct data', () => {
      const handler = vi.fn();
      const report = makeTrackReport('RADAR-1');

      bus.onTrackReport(handler);
      bus.publishTrackReport(report);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(report);
      expect(handler.mock.calls[0][0].sensorId).toBe(makeSensorId('RADAR-1'));
      expect(handler.mock.calls[0][0].localTracks).toHaveLength(1);
      expect(handler.mock.calls[0][0].localTracks[0].localTrackId).toBe('LT-1');
    });

    it('per-sensor routing via onTrackReportFrom', () => {
      const handlerR1 = vi.fn();
      const handlerR2 = vi.fn();

      bus.onTrackReportFrom('RADAR-1', handlerR1);
      bus.onTrackReportFrom('RADAR-2', handlerR2);

      bus.publishTrackReport(makeTrackReport('RADAR-1'));

      expect(handlerR1).toHaveBeenCalledOnce();
      expect(handlerR2).not.toHaveBeenCalled();
    });

    it('multiple subscribers receive the same message', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.onTrackReport(handler1);
      bus.onTrackReport(handler2);

      const report = makeTrackReport('RADAR-1');
      bus.publishTrackReport(report);

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(handler1).toHaveBeenCalledWith(report);
      expect(handler2).toHaveBeenCalledWith(report);
    });
  });

  describe('bearing reports', () => {
    it('publish → subscriber receives', () => {
      const handler = vi.fn();
      const report = makeBearingReport('EO-1');

      bus.onBearingReport(handler);
      bus.publishBearingReport(report);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(report);
    });

    it('per-sensor routing via onBearingReportFrom', () => {
      const handlerEO1 = vi.fn();
      const handlerEO2 = vi.fn();

      bus.onBearingReportFrom('EO-1', handlerEO1);
      bus.onBearingReportFrom('EO-2', handlerEO2);

      bus.publishBearingReport(makeBearingReport('EO-1'));

      expect(handlerEO1).toHaveBeenCalledOnce();
      expect(handlerEO2).not.toHaveBeenCalled();
    });
  });

  describe('commands', () => {
    it('sent to specific sensor → only that sensor receives', () => {
      const handlerS1 = vi.fn();
      const handlerS2 = vi.fn();

      bus.onCommand('RADAR-1', handlerS1);
      bus.onCommand('RADAR-2', handlerS2);

      bus.sendCommand(makeCommand('RADAR-1'));

      expect(handlerS1).toHaveBeenCalledOnce();
      expect(handlerS2).not.toHaveBeenCalled();
    });

    it('onAnyCommand receives all commands', () => {
      const handler = vi.fn();

      bus.onAnyCommand(handler);
      bus.sendCommand(makeCommand('RADAR-1'));
      bus.sendCommand(makeCommand('RADAR-2'));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('both specific and wildcard subscribers receive', () => {
      const specificHandler = vi.fn();
      const wildcardHandler = vi.fn();

      bus.onCommand('RADAR-1', specificHandler);
      bus.onAnyCommand(wildcardHandler);

      const cmd = makeCommand('RADAR-1');
      bus.sendCommand(cmd);

      expect(specificHandler).toHaveBeenCalledWith(cmd);
      expect(wildcardHandler).toHaveBeenCalledWith(cmd);
    });
  });

  describe('ground truth', () => {
    it('broadcast → all subscribers receive', () => {
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
  });

  describe('lifecycle', () => {
    it('destroy() removes all listeners', () => {
      const trackHandler = vi.fn();
      const bearingHandler = vi.fn();
      const cmdHandler = vi.fn();
      const gtHandler = vi.fn();

      bus.onTrackReport(trackHandler);
      bus.onBearingReport(bearingHandler);
      bus.onAnyCommand(cmdHandler);
      bus.onGroundTruth(gtHandler);

      bus.destroy();

      bus.publishTrackReport(makeTrackReport('RADAR-1'));
      bus.publishBearingReport(makeBearingReport('EO-1'));
      bus.sendCommand(makeCommand('RADAR-1'));
      bus.broadcastGroundTruth(makeGroundTruth());

      expect(trackHandler).not.toHaveBeenCalled();
      expect(bearingHandler).not.toHaveBeenCalled();
      expect(cmdHandler).not.toHaveBeenCalled();
      expect(gtHandler).not.toHaveBeenCalled();
    });

    it('removeAllListeners() clears subscribers', () => {
      const handler = vi.fn();
      bus.onTrackReport(handler);

      bus.removeAllListeners();
      bus.publishTrackReport(makeTrackReport('RADAR-1'));

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
