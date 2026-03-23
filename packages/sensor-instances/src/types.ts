import type { Position3D, SensorType } from '@eloc2/domain';
import type { SensorMode } from '@eloc2/sensor-bus';

// ── Sensor Instance Configuration ──

/**
 * Configuration for instantiating a sensor model.
 * Defined locally to avoid circular dependency with scenario-library.
 */
export interface SensorInstanceConfig {
  sensorId: string;
  type: SensorType; // 'radar' | 'eo' | 'c4isr'
  position: Position3D;
  coverage: {
    minAzDeg: number;
    maxAzDeg: number;
    minElDeg: number;
    maxElDeg: number;
    maxRangeM: number;
  };
  fov?: {
    halfAngleHDeg: number;
    halfAngleVDeg: number;
  };
  slewRateDegPerSec?: number;
  maxDetectionRangeM?: number;
  /** How often this sensor generates observations (1s for radar, 2s for EO, 12s for C4ISR) */
  updateIntervalSec: number;
}

// ── Tick Result ──

/** Result returned by a sensor after each simulation tick */
export interface SensorTickResult {
  sensorId: string;
  simTimeSec: number;
  observationsGenerated: number;
  localTrackCount: number;
  mode: SensorMode;
  online: boolean;
}
