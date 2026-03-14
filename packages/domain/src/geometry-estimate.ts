import type {
  Covariance3x3,
  EoTrackId,
  Position3D,
} from './common-types.js';

// ---------------------------------------------------------------------------
// Geometry classification & quality
// ---------------------------------------------------------------------------

/** Classification of the 3-D geometry reconstruction. */
export type GeometryClass = 'bearing_only' | 'candidate_3d' | 'confirmed_3d';

/** Qualitative assessment of the geometry estimate. */
export type GeometryQuality = 'strong' | 'acceptable' | 'weak' | 'insufficient';

// ---------------------------------------------------------------------------
// Geometry estimate
// ---------------------------------------------------------------------------

/**
 * Result of multi-sensor geometry computation (e.g. bearing-intersection).
 * May or may not yield a 3-D position depending on the available data.
 */
export interface GeometryEstimate {
  estimateId: string;
  eoTrackIds: EoTrackId[];
  position3D: Position3D | undefined;
  covariance3D: Covariance3x3 | undefined;
  quality: GeometryQuality;
  classification: GeometryClass;
  /** Angle between the intersecting bearing lines (degrees). */
  intersectionAngleDeg: number;
  /** Time alignment quality in milliseconds. */
  timeAlignmentQualityMs: number;
  /** Estimated bearing noise in degrees. */
  bearingNoiseDeg: number;
}
