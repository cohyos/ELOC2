/**
 * Branded type helper — creates a nominal type alias over a base type.
 * This prevents accidental assignment between structurally identical types
 * (e.g. SystemTrackId vs SourceTrackId) while keeping runtime cost at zero.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

// ---------------------------------------------------------------------------
// Branded string identifiers
// ---------------------------------------------------------------------------

/** Globally unique identifier for a fused system track. */
export type SystemTrackId = Brand<string, 'SystemTrackId'>;

/** Identifier for a sensor-local (source) track. */
export type SourceTrackId = Brand<string, 'SourceTrackId'>;

/** Identifier for an EO-originated track. */
export type EoTrackId = Brand<string, 'EoTrackId'>;

/** Identifier for a sensor platform. */
export type SensorId = Brand<string, 'SensorId'>;

/** Identifier for a task (cue-to-sensor assignment). */
export type TaskId = Brand<string, 'TaskId'>;

/** Identifier for a domain event. */
export type EventId = Brand<string, 'EventId'>;

/** Identifier for a cue sent to an EO sensor. */
export type CueId = Brand<string, 'CueId'>;

/** Identifier for an unresolved-group. */
export type GroupId = Brand<string, 'GroupId'>;

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

/** Milliseconds since Unix epoch. */
export type Timestamp = Brand<number, 'Timestamp'>;

// ---------------------------------------------------------------------------
// Spatial primitives
// ---------------------------------------------------------------------------

/** Geodetic position (WGS-84). */
export interface Position3D {
  lat: number;
  lon: number;
  alt: number;
}

/** Velocity in a local East-North-Up (ENU) frame (m/s). */
export interface Velocity3D {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * 3x3 covariance matrix stored as a nested number array.
 * Row-major: [[c00, c01, c02], [c10, c11, c12], [c20, c21, c22]].
 */
export type Covariance3x3 = number[][];

/**
 * 6x6 covariance matrix (position + velocity).
 * Row-major layout analogous to Covariance3x3.
 */
export type Covariance6x6 = number[][];

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

/** Qualitative health / quality indicator used across registration and fusion. */
export type QualityLevel = 'good' | 'degraded' | 'unsafe';

// ---------------------------------------------------------------------------
// Bearing measurement
// ---------------------------------------------------------------------------

/** A single angular measurement from a sensor. */
export interface BearingMeasurement {
  azimuthDeg: number;
  elevationDeg: number;
  timestamp: Timestamp;
  sensorId: SensorId;
}
