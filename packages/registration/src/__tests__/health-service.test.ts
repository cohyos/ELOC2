import { describe, it, expect, beforeEach } from 'vitest';
import type { SensorId, SpatialBias } from '@eloc2/domain';
import { RegistrationHealthService } from '../health-service.js';
import type { ClockHealthAssessment } from '../clock-health.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegistrationHealthService', () => {
  let service: RegistrationHealthService;
  const sensorId = 'radar-1' as SensorId;

  beforeEach(() => {
    service = new RegistrationHealthService();
  });

  it('should have no health data initially', () => {
    expect(service.getHealth(sensorId)).toBeUndefined();
    expect(service.getAllHealth()).toHaveLength(0);
    // Unknown sensor is assumed safe
    expect(service.isFusionSafe(sensorId)).toBe(true);
  });

  it('should calculate correct quality when bias is updated', () => {
    // Good quality bias
    const goodBias: SpatialBias = {
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.1,
      rangeBiasM: 50,
    };
    service.updateBias(sensorId, goodBias);

    const health = service.getHealth(sensorId);
    expect(health).toBeDefined();
    expect(health!.spatialQuality).toBe('good');
    expect(health!.fusionSafe).toBe(true);

    // Degraded quality bias
    const degradedBias: SpatialBias = {
      azimuthBiasDeg: 1.0,
      elevationBiasDeg: 0.2,
      rangeBiasM: 50,
    };
    service.updateBias(sensorId, degradedBias);

    const health2 = service.getHealth(sensorId);
    expect(health2!.spatialQuality).toBe('degraded');
    expect(health2!.fusionSafe).toBe(true);

    // Unsafe quality bias
    const unsafeBias: SpatialBias = {
      azimuthBiasDeg: 3.0,
      elevationBiasDeg: 0.1,
      rangeBiasM: 50,
    };
    service.updateBias(sensorId, unsafeBias);

    const health3 = service.getHealth(sensorId);
    expect(health3!.spatialQuality).toBe('unsafe');
    expect(health3!.fusionSafe).toBe(false);
  });

  it('should mark fusion safe when both spatial and timing are good', () => {
    service.updateBias(sensorId, {
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });
    service.updateClockHealth(sensorId, {
      offsetMs: 5,
      driftRateMs: 0,
      quality: 'good',
    });

    expect(service.isFusionSafe(sensorId)).toBe(true);
    const health = service.getHealth(sensorId);
    expect(health!.fusionSafe).toBe(true);
  });

  it('should mark fusion unsafe when spatial quality is unsafe', () => {
    service.updateBias(sensorId, {
      azimuthBiasDeg: 5.0,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });
    service.updateClockHealth(sensorId, {
      offsetMs: 5,
      driftRateMs: 0,
      quality: 'good',
    });

    expect(service.isFusionSafe(sensorId)).toBe(false);
    const health = service.getHealth(sensorId);
    expect(health!.fusionSafe).toBe(false);
    expect(health!.spatialQuality).toBe('unsafe');
  });

  it('should mark fusion unsafe when timing quality is unsafe', () => {
    service.updateBias(sensorId, {
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });
    service.updateClockHealth(sensorId, {
      offsetMs: 300,
      driftRateMs: 50,
      quality: 'unsafe',
    });

    expect(service.isFusionSafe(sensorId)).toBe(false);
    const health = service.getHealth(sensorId);
    expect(health!.fusionSafe).toBe(false);
    expect(health!.timingQuality).toBe('unsafe');
  });

  it('should emit registration state updated event on state change', () => {
    service.updateBias(sensorId, {
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });

    const event = service.emitHealthEvent(sensorId);

    expect(event.eventType).toBe('registration.state.updated');
    expect(event.data.sensorId).toBe(sensorId);
    expect(event.data.newState.sensorId).toBe(sensorId);
    expect(event.data.newState.spatialQuality).toBe('good');
    expect(event.data.estimationMethod).toBe('co-visible-track-pairs');
    expect(event.data.confidence).toBeGreaterThan(0);
    expect(event.provenance.source).toBe('registration');
  });

  it('should track multiple sensors independently', () => {
    const sensor1 = 'radar-1' as SensorId;
    const sensor2 = 'radar-2' as SensorId;

    service.updateBias(sensor1, {
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });
    service.updateBias(sensor2, {
      azimuthBiasDeg: 5.0,
      elevationBiasDeg: 0.1,
      rangeBiasM: 10,
    });

    expect(service.isFusionSafe(sensor1)).toBe(true);
    expect(service.isFusionSafe(sensor2)).toBe(false);
    expect(service.getAllHealth()).toHaveLength(2);
  });

  describe('determineSpatialQuality', () => {
    it('should return good for small biases', () => {
      expect(
        service.determineSpatialQuality({
          azimuthBiasDeg: 0.3,
          elevationBiasDeg: 0.3,
          rangeBiasM: 50,
        }),
      ).toBe('good');
    });

    it('should return degraded when azimuth > 0.5 deg', () => {
      expect(
        service.determineSpatialQuality({
          azimuthBiasDeg: 1.0,
          elevationBiasDeg: 0.1,
          rangeBiasM: 50,
        }),
      ).toBe('degraded');
    });

    it('should return degraded when range > 100m', () => {
      expect(
        service.determineSpatialQuality({
          azimuthBiasDeg: 0.1,
          elevationBiasDeg: 0.1,
          rangeBiasM: 200,
        }),
      ).toBe('degraded');
    });

    it('should return unsafe when azimuth > 2.0 deg', () => {
      expect(
        service.determineSpatialQuality({
          azimuthBiasDeg: 3.0,
          elevationBiasDeg: 0.1,
          rangeBiasM: 50,
        }),
      ).toBe('unsafe');
    });

    it('should return unsafe when range > 500m', () => {
      expect(
        service.determineSpatialQuality({
          azimuthBiasDeg: 0.1,
          elevationBiasDeg: 0.1,
          rangeBiasM: 600,
        }),
      ).toBe('unsafe');
    });
  });
});
