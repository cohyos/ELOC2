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

// ---------------------------------------------------------------------------
// Target classification
// ---------------------------------------------------------------------------

/** Taxonomy of target classifications for air defense. */
export type TargetClassification =
  | 'civilian_aircraft'
  | 'passenger_aircraft'
  | 'light_aircraft'
  | 'fighter_aircraft'
  | 'ally'
  | 'predator'
  | 'neutral'
  | 'unknown'
  | 'bird'
  | 'birds'
  | 'helicopter'
  | 'uav'
  | 'small_uav'
  | 'drone'
  | 'missile'
  | 'rocket';

/** Source that assigned a target classification. */
export type ClassificationSource = 'operator' | 'eo_identification' | 'c4isr' | 'scenario';

// ---------------------------------------------------------------------------
// DRI (Detection, Recognition, Identification) ranges
// ---------------------------------------------------------------------------

/** DRI tier achieved by an EO sensor for a given target at a given range. */
export type DriTier = 'detection' | 'recognition' | 'identification';

/**
 * DRI target size category — determines effective EO detection range.
 * Ballistic missiles/rockets have hot exhaust plumes (150km detection on 40km base),
 * aircraft are large (detected at full sensor range),
 * helicopters use the default/base range,
 * and small targets (UAVs, drones) are hardest to detect.
 */
export type DriTargetCategory = 'ballistic' | 'aircraft' | 'helicopter' | 'small';

/**
 * Range multipliers relative to sensor's maxDetectionRangeM for each DRI tier.
 * Detection > Recognition > Identification.
 */
export interface DriRangeProfile {
  detection: number;     // multiplier for detection range (e.g., 1.0 = full sensor range)
  recognition: number;   // multiplier for recognition range
  identification: number; // multiplier for identification range
}

/** DRI range profiles per target size category. */
export const DRI_PROFILES: Record<DriTargetCategory, DriRangeProfile> = {
  ballistic:  { detection: 3.75, recognition: 2.50, identification: 1.50 }, // 150km/100km/60km on 40km base
  aircraft:   { detection: 1.25, recognition: 0.80, identification: 0.50 },
  helicopter: { detection: 1.00, recognition: 0.60, identification: 0.35 },
  small:      { detection: 0.60, recognition: 0.35, identification: 0.15 },
};

/** Map a TargetClassification to its DRI target size category. */
export function getDriCategory(classification?: TargetClassification): DriTargetCategory {
  if (!classification || classification === 'unknown' || classification === 'neutral') {
    return 'helicopter'; // default
  }
  switch (classification) {
    case 'fighter_aircraft':
    case 'civilian_aircraft':
    case 'passenger_aircraft':
    case 'light_aircraft':
    case 'predator':
    case 'ally':
      return 'aircraft';
    case 'helicopter':
      return 'helicopter';
    case 'missile':
    case 'rocket':
      return 'ballistic';
    case 'uav':
    case 'small_uav':
    case 'drone':
    case 'bird':
    case 'birds':
      return 'small';
    default:
      return 'helicopter'; // fallback
  }
}

/**
 * Compute the DRI tier achieved and effective ranges for a target classification
 * at a given sensor base detection range.
 * Returns the tier achieved and the actual range thresholds.
 */
export function computeDriTier(
  rangeM: number,
  baseDetectionRangeM: number,
  classification?: TargetClassification,
): { tier: DriTier | null; ranges: { detectionM: number; recognitionM: number; identificationM: number } } {
  const category = getDriCategory(classification);
  const profile = DRI_PROFILES[category];

  const detectionM = baseDetectionRangeM * profile.detection;
  const recognitionM = baseDetectionRangeM * profile.recognition;
  const identificationM = baseDetectionRangeM * profile.identification;

  let tier: DriTier | null = null;
  if (rangeM <= identificationM) tier = 'identification';
  else if (rangeM <= recognitionM) tier = 'recognition';
  else if (rangeM <= detectionM) tier = 'detection';

  return { tier, ranges: { detectionM, recognitionM, identificationM } };
}

// ---------------------------------------------------------------------------
// Bearing measurement
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Land cover zones
// ---------------------------------------------------------------------------

/** Type of terrain / land cover. */
export type CoverType = 'urban' | 'forest' | 'water' | 'open';

/** A geographic zone whose terrain affects sensor detection probability. */
export interface CoverZone {
  id: string;
  name: string;
  polygon: Array<{ lat: number; lon: number }>;  // boundary vertices (closed polygon)
  coverType: CoverType;
  detectionProbabilityModifier: number;  // 0.0–1.0+, multiplies sensor Pd
}

/** Type of operational zone overlay. */
export type ZoneType = 'threat_corridor' | 'exclusion' | 'engagement' | 'safe_passage';

/** An operational zone drawn on the map (corridors, exclusion areas, etc.). */
export interface OperationalZone {
  id: string;
  name: string;
  zoneType: ZoneType;
  polygon: Array<{ lat: number; lon: number }>;  // boundary vertices
  color?: string;  // override default color
}

// ---------------------------------------------------------------------------
// Bearing measurement
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Radar Cross Section
// ---------------------------------------------------------------------------

/** Radar Cross Section in square meters for common target types */
export const TARGET_RCS: Record<string, number> = {
  fighter_aircraft: 5.0,    // 5 m²
  civilian_aircraft: 10.0,  // 10 m²
  uav: 0.1,                // 0.1 m²
  drone: 0.01,             // 0.01 m²
  helicopter: 3.0,         // 3 m²
  missile: 0.05,           // 0.05 m²
  rocket: 0.02,            // 0.02 m²
  unknown: 1.0,            // 1 m² default
};

/** A single angular measurement from a sensor. */
export interface BearingMeasurement {
  azimuthDeg: number;
  elevationDeg: number;
  timestamp: Timestamp;
  sensorId: SensorId;
}
