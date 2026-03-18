/**
 * Triangulation potential: compute intersection angle quality between sensor pairs.
 * Good triangulation requires bearings that cross at angles close to 90 degrees.
 */
import type { GeoPoint, PlacedSensor, GridCell } from './types.js';
import { haversineDistance } from './grid.js';

/**
 * Compute the azimuth from point A to point B in degrees [0, 360).
 */
function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Compute the intersection angle quality for a cell observed by two sensors.
 * Returns a value in [0, 1] where 1 = perfect 90-degree crossing.
 * The quality is sin(intersection_angle) which peaks at 90 degrees.
 */
export function intersectionAngleQuality(
  sensorA: GeoPoint,
  sensorB: GeoPoint,
  cell: GridCell,
): number {
  const bearA = bearingDeg(sensorA, cell.center);
  const bearB = bearingDeg(sensorB, cell.center);

  let diff = Math.abs(bearA - bearB);
  if (diff > 180) diff = 360 - diff;

  // sin(angle) peaks at 90 degrees
  return Math.sin((diff * Math.PI) / 180);
}

/**
 * Compute geometry score for placing a new sensor at candidatePos,
 * considering already-placed sensors.
 * Score is the average intersection angle quality across all cells
 * that both the new sensor and at least one existing sensor can see.
 */
export function geometryScore(
  candidatePos: GeoPoint,
  placedSensors: PlacedSensor[],
  cells: GridCell[],
): number {
  if (placedSensors.length === 0 || cells.length === 0) return 0;

  let totalQuality = 0;
  let count = 0;

  for (const cell of cells) {
    const dist = haversineDistance(candidatePos, cell.center);
    // Only consider cells within a reasonable range (50km)
    if (dist > 50_000) continue;

    for (const placed of placedSensors) {
      const placedDist = haversineDistance(placed.position, cell.center);
      if (placedDist > placed.spec.maxRangeM) continue;

      const quality = intersectionAngleQuality(candidatePos, placed.position, cell);
      totalQuality += quality;
      count++;
    }
  }

  return count > 0 ? totalQuality / count : 0;
}
