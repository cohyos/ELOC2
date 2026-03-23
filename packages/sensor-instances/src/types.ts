import type { Position3D, SensorType, BearingMeasurement, SourceObservation, Timestamp } from '@eloc2/domain';
import type { SensorMode } from '@eloc2/sensor-bus';

// ── Observation Generator Interfaces ──
// These decouple sensor instances from the simulator, enabling portability.
// Implement these interfaces to use sensors with any observation source
// (simulation, real hardware, recorded data replay, etc.)

/**
 * Sensor definition passed to observation generators.
 * Mirrors the scenario SensorDefinition but decoupled from simulator types.
 */
export interface SensorSpec {
  sensorId: string;
  type: SensorType;
  position: Position3D;
  coverage: {
    minAzDeg: number; maxAzDeg: number;
    minElDeg: number; maxElDeg: number;
    maxRangeM: number;
  };
  fov?: { halfAngleHDeg: number; halfAngleVDeg: number };
  slewRateDegPerSec?: number;
  maxDetectionRangeM?: number;
}

/** Fault definition for observation generators. */
export interface FaultSpec {
  type: string;
  sensorId: string;
  startTime: number;
  endTime?: number;
  magnitude?: number;
}

/** EO bearing observation returned by bearing generators. */
export interface EoBearingResult {
  sensorId: string;
  targetId: string;
  bearing: BearingMeasurement;
  imageQuality: number;
  driTier?: 'detection' | 'recognition' | 'identification';
}

/** Radar observation returned by radar generators. */
export interface RadarObservationResult {
  observation: SourceObservation;
}

/** C4ISR observation returned by C4ISR generators. */
export interface C4isrObservationResult {
  observation: SourceObservation;
}

/**
 * Generates EO bearing observations from ground truth.
 * Implement this interface to decouple EO sensors from the simulator.
 */
export interface EoBearingGenerator {
  (sensor: SensorSpec, targetPos: Position3D, timeSec: number,
   baseTimestamp: number, faults: FaultSpec[], targetId?: string,
   rng?: () => number, options?: Record<string, unknown>): EoBearingResult | undefined;
}

/**
 * Generates radar observations from ground truth.
 */
export interface RadarObservationGenerator {
  (sensor: SensorSpec, targetPos: Position3D, targetVel: any,
   timeSec: number, baseTimestamp: number, faults: FaultSpec[],
   targetId?: string, rng?: () => number,
   options?: Record<string, unknown>): RadarObservationResult | undefined;
}

/**
 * Generates C4ISR observations from ground truth.
 */
export interface C4isrObservationGenerator {
  (sensor: SensorSpec, targetPos: Position3D, targetVel: any,
   timeSec: number, baseTimestamp: number, faults: FaultSpec[],
   rng?: () => number): C4isrObservationResult | undefined;
}

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
