/**
 * Per-cell coverage computation.
 * Given a sensor position, FOV, range -> what fraction of grid cells are covered.
 */
import type { GeoPoint, SensorSpec, GridCell } from './types.js';
import { haversineDistance } from './grid.js';

/**
 * Compute azimuth from sensor to target point in degrees [0, 360).
 */
function azimuthDeg(from: GeoPoint, to: GeoPoint): number {
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Check if an azimuth falls within a sensor's coverage arc.
 * Handles wrap-around (e.g., minAz=350, maxAz=10).
 */
function inAzimuthRange(azDeg: number, minAzDeg: number, maxAzDeg: number): boolean {
  // Full 360 coverage
  if (maxAzDeg - minAzDeg >= 360) return true;

  const az = ((azDeg % 360) + 360) % 360;
  const min = ((minAzDeg % 360) + 360) % 360;
  const max = ((maxAzDeg % 360) + 360) % 360;

  if (min <= max) {
    return az >= min && az <= max;
  } else {
    // Wraps around 0
    return az >= min || az <= max;
  }
}

/**
 * Determine if a grid cell is covered by a sensor at a given position.
 */
export function isCellCovered(
  sensorPosition: GeoPoint,
  sensor: SensorSpec,
  cell: GridCell,
): boolean {
  const dist = haversineDistance(sensorPosition, cell.center);
  if (dist > sensor.maxRangeM) return false;

  const az = azimuthDeg(sensorPosition, cell.center);
  return inAzimuthRange(az, sensor.minAzDeg, sensor.maxAzDeg);
}

/**
 * Compute coverage score for placing a sensor at a candidate position.
 * Score = fraction of uncovered cells that become covered.
 * @param candidatePos - Where to place the sensor.
 * @param sensor - Sensor specification.
 * @param cells - All grid cells.
 * @param coveredMask - Boolean array indicating which cells are already covered.
 * @returns Score between 0 and 1.
 */
export function coverageScore(
  candidatePos: GeoPoint,
  sensor: SensorSpec,
  cells: GridCell[],
  coveredMask: boolean[],
): number {
  if (cells.length === 0) return 0;

  let newlyCovered = 0;
  let uncovered = 0;

  for (let i = 0; i < cells.length; i++) {
    if (!coveredMask[i]) {
      uncovered++;
      if (isCellCovered(candidatePos, sensor, cells[i])) {
        newlyCovered++;
      }
    }
  }

  if (uncovered === 0) return 0;
  return newlyCovered / cells.length; // Normalized by total cells for consistent scoring
}
