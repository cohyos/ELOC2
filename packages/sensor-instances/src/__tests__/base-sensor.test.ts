import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SensorId, Timestamp } from '@eloc2/domain';
import { SensorBus } from '@eloc2/sensor-bus';
import type {
  GroundTruthTarget,
  GroundTruthBroadcast,
  SensorTrackReport,
  SystemCommand,
} from '@eloc2/sensor-bus';
import { haversineDistanceM } from '@eloc2/shared-utils';

import { SensorInstance } from '../base-sensor.js';
import type { SensorInstanceConfig, SensorTickResult } from '../types.js';
import { registerSensorType, createSensorInstance, createSensorInstances } from '../sensor-factory.js';

// ── Mock Sensor ──

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
    return haversineDistanceM(
      this.config.position.lat, this.config.position.lon,
      target.position.lat, target.position.lon,
    ) < this.config.coverage.maxRangeM;
  }

  // Expose protected members for testing
  getVisibleTargets(): Map<string, GroundTruthTarget> {
    return this.visibleTargets;
  }

  testShouldUpdate(simTimeSec: number): boolean {
    return this.shouldUpdate(simTimeSec);
  }
}

// ── Test Fixtures ──

function createTestConfig(overrides?: Partial<SensorInstanceConfig>): SensorInstanceConfig {
  return {
    sensorId: 'radar-1',
    type: 'radar',
    position: { lat: 31.5, lon: 34.8, alt: 100 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: -5,
      maxElDeg: 45,
      maxRangeM: 100_000, // 100km
    },
    updateIntervalSec: 1,
    ...overrides,
  };
}

function createTestTarget(id: string, lat: number, lon: number, active = true): GroundTruthTarget {
  return {
    targetId: id,
    position: { lat, lon, alt: 5000 },
    velocity: { vx: 100, vy: 0, vz: 0 },
    active,
  };
}

function createGTBroadcast(targets: GroundTruthTarget[]): GroundTruthBroadcast {
  return {
    messageType: 'gt.broadcast',
    simTimeSec: 10,
    targets,
  };
}

// ── Tests ──

describe('SensorInstance (MockSensor)', () => {
  let bus: SensorBus;
  let config: SensorInstanceConfig;

  beforeEach(() => {
    bus = new SensorBus();
    config = createTestConfig();
  });

  it('can be instantiated with config and bus', () => {
    const sensor = new MockSensor(config, bus);
    expect(sensor.sensorId).toBe('radar-1');
    expect(sensor.sensorType).toBe('radar');
    expect(sensor.isOnline()).toBe(true);
    expect(sensor.getMode()).toBe('track');
  });

  it('GT broadcast filters targets by coverage (in-range vs out-of-range)', () => {
    const sensor = new MockSensor(config, bus);

    // Target within 100km of (31.5, 34.8)
    const inRange = createTestTarget('t1', 31.6, 34.9);
    // Target far away (~2000km)
    const outOfRange = createTestTarget('t2', 50.0, 50.0);
    // Inactive target within range
    const inactive = createTestTarget('t3', 31.5, 34.8, false);

    bus.broadcastGroundTruth(createGTBroadcast([inRange, outOfRange, inactive]));

    const visible = sensor.getVisibleTargets();
    expect(visible.size).toBe(1);
    expect(visible.has('t1')).toBe(true);
    expect(visible.has('t2')).toBe(false);
    expect(visible.has('t3')).toBe(false);
  });

  it('mode command changes sensor mode', () => {
    const sensor = new MockSensor(config, bus);
    expect(sensor.getMode()).toBe('track');

    const cmd: SystemCommand = {
      messageType: 'system.command',
      commandId: 'cmd-1',
      targetSensorId: 'radar-1' as SensorId,
      simTimeSec: 5,
      command: { type: 'mode', mode: 'search' },
    };
    bus.sendCommand(cmd);

    expect(sensor.getMode()).toBe('search');
  });

  it('tick() publishes track report on bus', () => {
    const sensor = new MockSensor(config, bus);
    const reports: SensorTrackReport[] = [];
    bus.onTrackReport((report) => reports.push(report));

    sensor.tick(1.0, 1.0);

    expect(reports.length).toBe(1);
    expect(reports[0].sensorId).toBe('radar-1');
    expect(reports[0].sensorType).toBe('radar');
    expect(reports[0].messageType).toBe('sensor.track.report');
    expect(reports[0].simTimeSec).toBe(1.0);
    expect(Array.isArray(reports[0].localTracks)).toBe(true);
  });

  it('sensor status report has correct fields', () => {
    const sensor = new MockSensor(config, bus);
    const reports: SensorTrackReport[] = [];
    bus.onTrackReport((report) => reports.push(report));

    sensor.tick(1.0, 1.0);

    const status = reports[0].sensorStatus;
    expect(status.sensorId).toBe('radar-1');
    expect(status.sensorType).toBe('radar');
    expect(status.online).toBe(true);
    expect(status.mode).toBe('track');
    expect(status.trackCount).toBe(0);
  });

  it('shouldUpdate respects update interval', () => {
    const sensor = new MockSensor(createTestConfig({ updateIntervalSec: 2 }), bus);

    // First check — no time has passed, lastUpdateSimSec is 0
    expect(sensor.testShouldUpdate(0)).toBe(false); // elapsed = 0, interval = 2
    expect(sensor.testShouldUpdate(1)).toBe(false); // elapsed = 1, interval = 2
    expect(sensor.testShouldUpdate(2)).toBe(true);  // elapsed = 2 >= 2

    // After a tick updates lastUpdateSimSec
    sensor.tick(2.0, 1.0);
    expect(sensor.testShouldUpdate(3)).toBe(false); // elapsed = 1
    expect(sensor.testShouldUpdate(4)).toBe(true);  // elapsed = 2
  });

  it('shouldUpdate returns false when offline', () => {
    const sensor = new MockSensor(config, bus);
    sensor.setOnline(false);
    expect(sensor.testShouldUpdate(100)).toBe(false);
  });

  it('shouldUpdate returns false when in standby mode', () => {
    const sensor = new MockSensor(config, bus);
    const cmd: SystemCommand = {
      messageType: 'system.command',
      commandId: 'cmd-2',
      targetSensorId: 'radar-1' as SensorId,
      simTimeSec: 0,
      command: { type: 'mode', mode: 'standby' },
    };
    bus.sendCommand(cmd);
    expect(sensor.testShouldUpdate(100)).toBe(false);
  });

  it('multiple sensors on same bus receive independent GT', () => {
    const config1 = createTestConfig({ sensorId: 'radar-1', coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 45, maxRangeM: 50_000 } });
    const config2 = createTestConfig({ sensorId: 'radar-2', coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 45, maxRangeM: 200_000 } });

    const sensor1 = new MockSensor(config1, bus);
    const sensor2 = new MockSensor(config2, bus);

    // Target ~80km away — inside sensor2 range but outside sensor1 range
    const target = createTestTarget('t1', 32.2, 34.8);

    bus.broadcastGroundTruth(createGTBroadcast([target]));

    expect(sensor1.getVisibleTargets().size).toBe(0); // 50km range, target ~80km
    expect(sensor2.getVisibleTargets().size).toBe(1); // 200km range, target ~80km
  });

  it('sensor factory creates instances after registering type', () => {
    registerSensorType('radar', MockSensor);

    const sensor = createSensorInstance(config, bus);
    expect(sensor).toBeInstanceOf(MockSensor);
    expect(sensor.sensorId).toBe('radar-1');
  });

  it('sensor factory throws for unregistered type', () => {
    expect(() => createSensorInstance(createTestConfig({ type: 'c4isr' }), bus))
      .toThrow('Unknown sensor type: c4isr');
  });

  it('createSensorInstances creates multiple sensors', () => {
    registerSensorType('radar', MockSensor);
    registerSensorType('eo', MockSensor);

    const configs = [
      createTestConfig({ sensorId: 'r1', type: 'radar' }),
      createTestConfig({ sensorId: 'e1', type: 'eo' }),
    ];
    const sensors = createSensorInstances(configs, bus);
    expect(sensors.length).toBe(2);
    expect(sensors[0].sensorId).toBe('r1');
    expect(sensors[1].sensorId).toBe('e1');
  });

  it('destroy() can be called without error', () => {
    const sensor = new MockSensor(config, bus);
    expect(() => sensor.destroy()).not.toThrow();
  });

  it('setOnline toggles online state', () => {
    const sensor = new MockSensor(config, bus);
    expect(sensor.isOnline()).toBe(true);
    sensor.setOnline(false);
    expect(sensor.isOnline()).toBe(false);
    sensor.setOnline(true);
    expect(sensor.isOnline()).toBe(true);
  });
});
