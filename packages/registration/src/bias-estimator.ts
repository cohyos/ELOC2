import type { Position3D, SensorId, SpatialBias, Timestamp } from '@eloc2/domain';
import { bearingDeg, haversineDistanceM } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Track pair — a co-visible detection from two sensors
// ---------------------------------------------------------------------------

export interface TrackPair {
  sensorId1: SensorId;
  sensorId2: SensorId;
  position1: Position3D;
  position2: Position3D;
  timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Bias estimator
// ---------------------------------------------------------------------------

/**
 * Estimate the systematic spatial bias of a sensor by comparing co-visible
 * track pairs.  The bias is computed as the mean of position differences
 * (in azimuth, elevation, and range) across all pairs.
 *
 * @param sensorId  The sensor whose bias is being estimated.
 * @param recentPairs  Track pairs where sensorId appears as sensorId1.
 * @returns The estimated spatial bias.  All zeros when no pairs are available.
 */
export function estimateBias(
  sensorId: SensorId,
  recentPairs: TrackPair[],
): SpatialBias {
  if (recentPairs.length === 0) {
    return { azimuthBiasDeg: 0, elevationBiasDeg: 0, rangeBiasM: 0 };
  }

  let azimuthSum = 0;
  let elevationSum = 0;
  let rangeSum = 0;

  for (const pair of recentPairs) {
    // Azimuth bias: difference in bearing from origin (0,0) is not meaningful;
    // instead compute the difference in bearing that each position implies.
    // We use the bearing from position2 to position1 minus the reverse as a
    // proxy for the angular offset between the two sensor reports.
    const bearing1 = bearingDeg(0, 0, pair.position1.lat, pair.position1.lon);
    const bearing2 = bearingDeg(0, 0, pair.position2.lat, pair.position2.lon);
    let azDiff = bearing1 - bearing2;
    // Normalize to [-180, 180]
    if (azDiff > 180) azDiff -= 360;
    if (azDiff < -180) azDiff += 360;
    azimuthSum += azDiff;

    // Elevation bias: difference in altitude converted to an angular estimate.
    const range = haversineDistanceM(
      pair.position1.lat,
      pair.position1.lon,
      pair.position2.lat,
      pair.position2.lon,
    );
    const altDiff = pair.position1.alt - pair.position2.alt;
    // Elevation angle difference in degrees: atan2(altDiff, range)
    // When range is 0 but altDiff is non-zero, atan2 correctly returns +-90 deg.
    const elevDiffDeg =
      (range > 0 || altDiff !== 0)
        ? Math.atan2(altDiff, range) * (180 / Math.PI)
        : 0;
    elevationSum += elevDiffDeg;

    // Range bias: haversine distance between the two reported positions
    // plus altitude difference as 3D range offset.
    const range3D = Math.sqrt(range * range + altDiff * altDiff);
    rangeSum += range3D;
  }

  const n = recentPairs.length;
  return {
    azimuthBiasDeg: azimuthSum / n,
    elevationBiasDeg: elevationSum / n,
    rangeBiasM: rangeSum / n,
  };
}
