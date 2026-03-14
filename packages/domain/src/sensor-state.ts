import type {
  Position3D,
  SensorId,
  SystemTrackId,
  Timestamp,
} from './common-types.js';

// ---------------------------------------------------------------------------
// Sensor type
// ---------------------------------------------------------------------------

/** Modality of a sensor platform. */
export type SensorType = 'radar' | 'eo' | 'c4isr';

// ---------------------------------------------------------------------------
// Gimbal, FOV, coverage
// ---------------------------------------------------------------------------

/** Current gimbal state (applicable to EO sensors). */
export interface GimbalState {
  azimuthDeg: number;
  elevationDeg: number;
  slewRateDegPerSec: number;
  currentTargetId: SystemTrackId | undefined;
}

/** Instantaneous field of view (half-angles). */
export interface FieldOfView {
  halfAngleHDeg: number;
  halfAngleVDeg: number;
}

/** Angular and range coverage arc of a sensor. */
export interface CoverageArc {
  minAzDeg: number;
  maxAzDeg: number;
  minElDeg: number;
  maxElDeg: number;
  maxRangeM: number;
}

// ---------------------------------------------------------------------------
// Sensor state
// ---------------------------------------------------------------------------

/**
 * Runtime state of a sensor platform.
 * Gimbal state is only present for EO sensors — radars do not expose
 * gimbal information in this model.
 */
export interface SensorState {
  sensorId: SensorId;
  sensorType: SensorType;
  position: Position3D;
  /** Only present for EO sensors. */
  gimbal: GimbalState | undefined;
  fov: FieldOfView | undefined;
  coverage: CoverageArc;
  online: boolean;
  lastUpdateTime: Timestamp;
}
