import type {
  Covariance3x3,
  EoCue,
  Position3D,
  QualityLevel,
  SensorState,
  SystemTrack,
  Timestamp,
  CueId,
} from '@eloc2/domain';
import {
  DEG_TO_RAD,
  RAD_TO_DEG,
  haversineDistanceM,
  generateId,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

/** Default cue validity window in milliseconds (30 seconds). */
const DEFAULT_VALIDITY_WINDOW_MS = 30_000;

/** Default suggested dwell time in milliseconds. */
const DEFAULT_DWELL_MS = 5_000;

/** Process noise scaling factor (m^2/s^2). */
const PROCESS_NOISE_FACTOR = 1.0;

// ---------------------------------------------------------------------------
// State prediction
// ---------------------------------------------------------------------------

/**
 * Predicts the track state forward in time using constant-velocity
 * extrapolation and grows the covariance by process noise proportional
 * to dt^2.
 *
 * @param track      - The system track to extrapolate from.
 * @param targetTime - Target time (ms since epoch).
 * @returns Predicted position and inflated covariance.
 */
export function predictState(
  track: SystemTrack,
  targetTime: Timestamp,
): { position: Position3D; covariance: Covariance3x3 } {
  const dtSec = (targetTime - track.lastUpdated) / 1000;

  const vx = track.velocity?.vx ?? 0;
  const vy = track.velocity?.vy ?? 0;
  const vz = track.velocity?.vz ?? 0;

  const latRad = track.state.lat * DEG_TO_RAD;

  // Constant velocity extrapolation in geodetic coordinates
  const predictedLat = track.state.lat + (vy * dtSec) / 111_320;
  const predictedLon =
    track.state.lon + (vx * dtSec) / (111_320 * Math.cos(latRad));
  const predictedAlt = track.state.alt + vz * dtSec;

  const position: Position3D = {
    lat: predictedLat,
    lon: predictedLon,
    alt: predictedAlt,
  };

  // Grow covariance: P_pred = P + Q where Q_ii = processNoise * dt^2
  const q = PROCESS_NOISE_FACTOR * dtSec * dtSec;
  const covariance: Covariance3x3 = track.covariance.map((row, i) =>
    row.map((val, j) => (i === j ? val + q : val)),
  );

  return { position, covariance };
}

// ---------------------------------------------------------------------------
// Cue validity
// ---------------------------------------------------------------------------

/**
 * Checks whether a cue is still valid at the given time.
 *
 * @param cue         - The EO cue to check.
 * @param currentTime - Current time (ms since epoch).
 * @returns `true` if currentTime falls within [validFrom, validTo].
 */
export function isCueValid(cue: EoCue, currentTime: Timestamp): boolean {
  return currentTime >= cue.validFrom && currentTime <= cue.validTo;
}

// ---------------------------------------------------------------------------
// Cue issuance
// ---------------------------------------------------------------------------

/**
 * Issues an EO cue for a system track to be investigated by a given sensor.
 *
 * The function:
 * 1. Extrapolates the track state to the current time.
 * 2. Computes an angular uncertainty gate from the covariance and range.
 * 3. Derives a priority from track confidence.
 * 4. Packages everything into an EoCue.
 *
 * @param systemTrack        - The system track to cue on.
 * @param sensor             - The EO sensor state that will receive the cue.
 * @param registrationHealth - Optional quality level of sensor registration.
 * @returns A fully populated EoCue.
 */
export function issueCue(
  systemTrack: SystemTrack,
  sensor: SensorState,
  registrationHealth: QualityLevel = 'good',
): EoCue {
  const now = Date.now() as Timestamp;

  // 1. Predict the track state forward to now
  const { position, covariance } = predictState(systemTrack, now);

  // 2. Compute range from sensor to predicted position (horizontal distance)
  const rangeM = haversineDistanceM(
    sensor.position.lat,
    sensor.position.lon,
    position.lat,
    position.lon,
  );

  // 3. Compute uncertainty gate from covariance
  //    Use the maximum position variance as the spatial uncertainty (in meters),
  //    then convert to angular uncertainty at the given range.
  const maxPositionVariance = Math.max(
    covariance[0][0],
    covariance[1][1],
  );
  const positionUncertaintyM = Math.sqrt(maxPositionVariance);

  // Angular uncertainty = atan(spatialUncertainty / range) in degrees
  // Guard against zero or very small range
  const uncertaintyGateDeg =
    rangeM > 1
      ? Math.atan(positionUncertaintyM / rangeM) * RAD_TO_DEG
      : 90; // if essentially co-located, use a wide gate

  // 4. Priority: higher confidence tracks get higher priority (scale 1-10)
  //    A track with confidence 1.0 gets priority 10, confidence 0.0 gets priority 1.
  const priority = Math.round(1 + systemTrack.confidence * 9);

  // 5. Validity window
  const validFrom = now;
  const validTo = (now + DEFAULT_VALIDITY_WINDOW_MS) as Timestamp;

  return {
    cueId: generateId() as CueId,
    systemTrackId: systemTrack.systemTrackId,
    predictedState: position,
    predictedVelocity: systemTrack.velocity,
    covariance,
    uncertaintyGateDeg,
    priority,
    validFrom,
    validTo,
    expectedTargetCount: 1,
    suggestedDwellMs: DEFAULT_DWELL_MS,
    registrationHealth,
  };
}
