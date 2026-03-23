import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId } from '@eloc2/domain';
import type {
  GroundTruthBroadcast,
  GroundTruthTarget,
  SensorTrackReport,
  SystemCommand,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { haversineDistanceM } from '@eloc2/shared-utils';

import { SensorInstance } from '../base-sensor.js';
import type { SensorInstanceConfig, SensorTickResult } from '../types.js';
import {
  registerSensorType,
  createSensorInstance,
  createSensorInstances,
} from '../sensor-factory.js';

// ── Helpers ──

function makeSensorId(id: string): SensorId {
  return id as unknown as SensorId;
}

/** Realistic config — radar near Be'er Sheva, Israel */
function makeRadarConfig(
  overrides?: Partial<SensorInstanceConfig>,
): SensorInstanceConfig {
  return {
    sensorId: 'RADAR-1',
    type: 'radar',
    position: { lat: 31.25, lon: 34.79, alt: 200 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: 0,
      maxElDeg: 45,
      maxRangeM: 150_000,
    },
    updateIntervalSec: 1,
    ...overrides,
  };
}

/** Target inside radar coverage (~50 km away) */
function makeNearTarget(): GroundTruthTarget {
  return {
    targetId: 'TGT-NEAR',
    position: { lat: 31.7, lon: 34.9, alt: 5000 },
    velocity: { vx: 200, vy: -50, vz: 0 },
    classification: 'hostile',
    rcs: 5.0,
    active: true,
  };
}

/** Target outside radar coverage (~300 km away) */
function makeFarTarget(): GroundTruthTarget {
  return {
    targetId: 'TGT-FAR',
    position: { lat: 34.0, lon: 36.0, alt: 10000 },
    velocity: { vx: -100, vy: 0, vz: 0 },
    classification: 'hostile',
    rcs: 3.0,
    active: true,
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

function makeModeCommand(
  targetSensorId: string,
  mode: 'track' | 'search' | 'standby',
): SystemCommand {
  return {
    messageType: 'system.command',
    commandId: 'CMD-001',
    targetSensorId: makeSensorId(targetSensorId),
    simTimeSec: 5,
    command: { type: 'mode', mode },
  };
}

// ── MockSensor — concrete subclass for testing ──

class MockSensor extends SensorInstance {
  tickCount = 0;

  tick(simTimeSec: number, _dtSec: number): SensorTickResult {
    this.tickCount++;
    this.lastUpdateSimSec = simTimeSec;
    this.publishTrackReport(simTimeSec);
    return {
      sensorId: this.sensorId,
      simTimeSec,
      observationsGenerated: 0,
      localTrackCount: 0,
      mode: this.mode,
      online: this.online,
    };
  }

  filterTargetByCoverage(target: GroundTruthTarget): boolean {
    // Simple range check
    return (
      haversineDistanceM(
        this.config.position.lat,
        this.config.position.lon,
        target.position.lat,
        target.position.lon,
      ) < this.config.coverage.maxRangeM
    );
  }

  // Expose protected for testing
  getVisibleTargets(): Map<string, GroundTruthTarget> {
    return this.visibleTargets;
  }

  testShouldUpdate(simTimeSec: number): boolean {
    return this.shouldUpdate(simTimeSec);
  }
}

// ── Tests ──

describe('SensorInstance (base class via MockSensor)', () => {
  let bus: SensorBus;
  let sensor: MockSensor;

  beforeEach(() => {
    bus = new SensorBus();
    sensor = new MockSensor(makeRadarConfig(), bus);
  });

  it('can be instantiated with config and bus', () => {
    expect(sensor).toBeInstanceOf(SensorInstance);
    expect(sensor.sensorId).toBe('RADAR-1');
    expect(sensor.sensorType).toBe('radar');
    expect(sensor.isOnline()).toBe(true);
    expect(sensor.getMode()).toBe('track');
  });

  describe('ground truth filtering', () => {
    it('filters targets by coverage — in-range target is visible', () => {
      const gt = makeGroundTruth([makeNearTarget()]);
      bus.broadcastGroundTruth(gt);

      const visible = sensor.getVisibleTargets();
      expect(visible.size).toBe(1);
      expect(visible.has('TGT-NEAR')).toBe(true);
    });

    it('filters targets by coverage — out-of-range target is excluded', () => {
      const gt = makeGroundTruth([makeFarTarget()]);
      bus.broadcastGroundTruth(gt);

      const visible = sensor.getVisibleTargets();
      expect(visible.size).toBe(0);
    });

    it('mixed in-range and out-of-range targets', () => {
      const gt = makeGroundTruth([makeNearTarget(), makeFarTarget()]);
      bus.broadcastGroundTruth(gt);

      const visible = sensor.getVisibleTargets();
      expect(visible.size).toBe(1);
      expect(visible.has('TGT-NEAR')).toBe(true);
      expect(visible.has('TGT-FAR')).toBe(false);
    });

    it('inactive targets are excluded', () => {
      const inactiveTarget = { ...makeNearTarget(), active: false };
      const gt = makeGroundTruth([inactiveTarget]);
      bus.broadcastGroundTruth(gt);

      expect(sensor.getVisibleTargets().size).toBe(0);
    });
  });

  describe('command handling', () => {
    it('mode command changes sensor mode', () => {
      expect(sensor.getMode()).toBe('track');

      bus.sendCommand(makeModeCommand('RADAR-1', 'search'));
      expect(sensor.getMode()).toBe('search');

      bus.sendCommand(makeModeCommand('RADAR-1', 'standby'));
      expect(sensor.getMode()).toBe('standby');
    });

    it('commands for other sensors are ignored', () => {
      bus.sendCommand(makeModeCommand('RADAR-2', 'standby'));
      expect(sensor.getMode()).toBe('track');
    });
  });

  describe('tick and track report publishing', () => {
    it('tick() publishes track report on bus', () => {
      const handler = vi.fn();
      bus.onTrackReport(handler);

      sensor.tick(1.0, 1.0);

      expect(handler).toHaveBeenCalledOnce();
      const report: SensorTrackReport = handler.mock.calls[0][0];
      expect(report.messageType).toBe('sensor.track.report');
      expect(report.sensorId).toBe(makeSensorId('RADAR-1'));
      expect(report.sensorType).toBe('radar');
      expect(report.simTimeSec).toBe(1.0);
      expect(Array.isArray(report.localTracks)).toBe(true);
    });

    it('tick increments internal counter', () => {
      expect(sensor.tickCount).toBe(0);
      sensor.tick(1.0, 1.0);
      sensor.tick(2.0, 1.0);
      expect(sensor.tickCount).toBe(2);
    });
  });

  describe('sensor status report', () => {
    it('has correct fields', () => {
      const handler = vi.fn();
      bus.onTrackReport(handler);

      sensor.tick(1.0, 1.0);

      const report: SensorTrackReport = handler.mock.calls[0][0];
      const status = report.sensorStatus;
      expect(status.sensorId).toBe(makeSensorId('RADAR-1'));
      expect(status.sensorType).toBe('radar');
      expect(status.online).toBe(true);
      expect(status.mode).toBe('track');
      expect(typeof status.trackCount).toBe('number');
    });
  });

  describe('shouldUpdate timing', () => {
    it('respects update interval', () => {
      // Initial — never updated, so elapsed = simTime - 0 >= interval
      expect(sensor.testShouldUpdate(0.5)).toBe(false); // 0.5 < 1.0 interval
      expect(sensor.testShouldUpdate(1.0)).toBe(true); // 1.0 >= 1.0 interval

      // After ticking at t=1, lastUpdateSimSec=1
      sensor.tick(1.0, 1.0);
      expect(sensor.testShouldUpdate(1.5)).toBe(false); // 0.5 elapsed < 1.0
      expect(sensor.testShouldUpdate(2.0)).toBe(true); // 1.0 elapsed >= 1.0
    });

    it('returns false when offline', () => {
      sensor.setOnline(false);
      expect(sensor.testShouldUpdate(10.0)).toBe(false);
    });

    it('returns false in standby mode', () => {
      bus.sendCommand(makeModeCommand('RADAR-1', 'standby'));
      expect(sensor.testShouldUpdate(10.0)).toBe(false);
    });
  });

  describe('multiple sensors on same bus', () => {
    it('each sensor receives independent GT and filters independently', () => {
      const config2 = makeRadarConfig({
        sensorId: 'RADAR-2',
        position: { lat: 32.0, lon: 35.0, alt: 100 },
        coverage: {
          minAzDeg: 0,
          maxAzDeg: 360,
          minElDeg: 0,
          maxElDeg: 45,
          maxRangeM: 30_000, // shorter range — near target is ~35km away
        },
      });
      const sensor2 = new MockSensor(config2, bus);

      // Near target is ~50km from RADAR-1 (in range) but farther from RADAR-2
      const gt = makeGroundTruth([makeNearTarget()]);
      bus.broadcastGroundTruth(gt);

      expect(sensor.getVisibleTargets().size).toBe(1);
      expect(sensor2.getVisibleTargets().size).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('setOnline / isOnline', () => {
      expect(sensor.isOnline()).toBe(true);
      sensor.setOnline(false);
      expect(sensor.isOnline()).toBe(false);
      sensor.setOnline(true);
      expect(sensor.isOnline()).toBe(true);
    });

    it('destroy() does not throw', () => {
      expect(() => sensor.destroy()).not.toThrow();
    });
  });
});

describe('Sensor Factory', () => {
  let bus: SensorBus;

  beforeEach(() => {
    bus = new SensorBus();
  });

  it('creates instance after registering sensor type', () => {
    registerSensorType(
      'radar',
      MockSensor as unknown as new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance,
    );

    const config = makeRadarConfig();
    const instance = createSensorInstance(config, bus);

    expect(instance).toBeInstanceOf(MockSensor);
    expect(instance.sensorId).toBe('RADAR-1');
  });

  it('throws for unregistered sensor type', () => {
    expect(() =>
      createSensorInstance(makeRadarConfig({ type: 'c4isr' }), bus),
    ).toThrow('Unknown sensor type: c4isr');
  });

  it('createSensorInstances batch-creates from array', () => {
    registerSensorType(
      'radar',
      MockSensor as unknown as new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance,
    );

    const configs = [
      makeRadarConfig({ sensorId: 'R-1' }),
      makeRadarConfig({ sensorId: 'R-2' }),
      makeRadarConfig({ sensorId: 'R-3' }),
    ];
    const instances = createSensorInstances(configs, bus);

    expect(instances).toHaveLength(3);
    expect(instances[0].sensorId).toBe('R-1');
    expect(instances[1].sensorId).toBe('R-2');
    expect(instances[2].sensorId).toBe('R-3');
  });
});
