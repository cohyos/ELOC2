/**
 * Converts parsed ASTERIX records (CAT-048 / CAT-062) into the ELOC2
 * SourceObservation format for ingestion by the fusion pipeline.
 */

import type {
  Covariance3x3,
  Position3D,
  SensorId,
  Timestamp,
  Velocity3D,
} from '@eloc2/domain';
import type { SourceObservation } from '@eloc2/domain';
import type { Cat048Record, Cat062Record } from './parser.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NM_TO_METERS = 1852;
const FL_TO_METERS = 30.48; // 1 FL = 100 ft = 30.48 m
const DEG_TO_RAD = Math.PI / 180;

/** Approximate meters per degree of latitude. */
const METERS_PER_DEG_LAT = 111_320;

/** Counter for generating unique observation IDs. */
let observationSeq = 0;

function nextObservationId(): string {
  return `asterix-obs-${++observationSeq}`;
}

// ---------------------------------------------------------------------------
// Coordinate conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a polar measurement (range + azimuth from a known sensor position)
 * to a WGS-84 lat/lon position.
 *
 * Uses a flat-earth approximation which is adequate for ranges under ~100 NM.
 */
function polarToLatLon(
  sensorPos: Position3D,
  rhoNm: number,
  thetaDeg: number,
): { lat: number; lon: number } {
  const rangeMeters = rhoNm * NM_TO_METERS;
  const thetaRad = thetaDeg * DEG_TO_RAD;

  // Azimuth: 0 = North, clockwise → dx = sin(theta), dy = cos(theta)
  const dxMeters = rangeMeters * Math.sin(thetaRad);
  const dyMeters = rangeMeters * Math.cos(thetaRad);

  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(sensorPos.lat * DEG_TO_RAD);

  const lat = sensorPos.lat + dyMeters / METERS_PER_DEG_LAT;
  const lon = sensorPos.lon + dxMeters / metersPerDegLon;

  return { lat, lon };
}

/**
 * Build a time-of-day (seconds past midnight) to a Unix timestamp.
 * Uses today's date as the reference.
 */
function timeOfDayToTimestamp(todSeconds: number): Timestamp {
  const now = new Date();
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (midnightUtc + todSeconds * 1000) as Timestamp;
}

// ---------------------------------------------------------------------------
// Default covariance matrices
// ---------------------------------------------------------------------------

/**
 * Default position covariance for CAT-048 radar plots.
 * Assumes ~50m range accuracy, ~0.1 deg azimuth accuracy at 50 NM.
 * Diagonal: [lat_var, lon_var, alt_var] in degrees^2.
 */
function radarCovariance(): Covariance3x3 {
  const posVarDeg = (100 / METERS_PER_DEG_LAT) ** 2; // ~100m => degrees^2
  const altVar = 150 * 150; // 150m altitude uncertainty
  return [
    [posVarDeg, 0, 0],
    [0, posVarDeg, 0],
    [0, 0, altVar],
  ];
}

/**
 * Default position covariance for CAT-062 system tracks.
 * Multi-sensor fused tracks are typically more accurate than raw plots.
 */
function systemTrackCovariance(): Covariance3x3 {
  const posVarDeg = (50 / METERS_PER_DEG_LAT) ** 2; // ~50m
  const altVar = 75 * 75; // 75m altitude
  return [
    [posVarDeg, 0, 0],
    [0, posVarDeg, 0],
    [0, 0, altVar],
  ];
}

// ---------------------------------------------------------------------------
// CAT-048 → SourceObservation
// ---------------------------------------------------------------------------

/**
 * Convert a parsed CAT-048 radar plot record to a SourceObservation.
 *
 * @param record  Parsed CAT-048 record
 * @param sensorPos  Known geodetic position of the radar that produced this plot
 * @returns SourceObservation ready for fusion pipeline ingestion
 */
export function cat048ToObservation(
  record: Cat048Record,
  sensorPos: Position3D,
): SourceObservation {
  const { lat, lon } = polarToLatLon(
    sensorPos,
    record.measuredPosition.rho,
    record.measuredPosition.theta,
  );

  // Altitude from flight level if available, otherwise use sensor altitude
  const alt = record.flightLevel != null
    ? record.flightLevel * FL_TO_METERS
    : sensorPos.alt;

  const sensorId = `radar-${record.sac}-${record.sic}` as SensorId;

  return {
    observationId: nextObservationId(),
    sensorId,
    timestamp: timeOfDayToTimestamp(record.timeOfDay),
    position: { lat, lon, alt },
    velocity: undefined, // CAT-048 plots typically don't include velocity
    covariance: radarCovariance(),
    sensorFrame: 'radar',
  };
}

// ---------------------------------------------------------------------------
// CAT-062 → SourceObservation
// ---------------------------------------------------------------------------

/**
 * Convert a parsed CAT-062 system track record to a SourceObservation.
 *
 * @param record  Parsed CAT-062 record
 * @returns SourceObservation ready for fusion pipeline ingestion
 */
export function cat062ToObservation(record: Cat062Record): SourceObservation {
  const alt = record.flightLevel != null
    ? record.flightLevel * FL_TO_METERS
    : 0;

  const velocity: Velocity3D | undefined = record.velocity
    ? { vx: record.velocity.vx, vy: record.velocity.vy, vz: 0 }
    : undefined;

  const sensorId = `sdps-${record.sac}-${record.sic}` as SensorId;

  return {
    observationId: nextObservationId(),
    sensorId,
    timestamp: timeOfDayToTimestamp(record.timeOfDay),
    position: {
      lat: record.position.lat,
      lon: record.position.lon,
      alt,
    },
    velocity,
    covariance: systemTrackCovariance(),
    sensorFrame: 'radar', // CAT-062 is a fused radar/multi-sensor product
  };
}
