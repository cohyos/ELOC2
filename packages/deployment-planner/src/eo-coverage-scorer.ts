/**
 * EO-specific coverage scoring.
 * Scores cells based on how many EO sensors can observe them.
 * Higher score for cells visible by 2+ EO sensors (enables triangulation).
 */
import type { GeoPoint, PlacedSensor, GridCell, SensorSpec } from './types.js';
import { haversineDistance } from './grid.js';
import { isCellCovered } from './coverage-scorer.js';

/**
 * Count how many EO sensors (both already-placed and the candidate) can observe a cell.
 */
function eoVisibilityCount(
  cell: GridCell,
  candidatePos: GeoPoint,
  candidateSensor: SensorSpec,
  placedSensors: PlacedSensor[],
): number {
  let count = 0;

  // Check candidate sensor
  if (candidateSensor.type === 'eo' && isCellCovered(candidatePos, candidateSensor, cell)) {
    count++;
  }

  // Check already-placed EO sensors
  for (const placed of placedSensors) {
    if (placed.spec.type === 'eo' && isCellCovered(placed.position, placed.spec, cell)) {
      count++;
    }
  }

  return count;
}

/**
 * Compute EO coverage score for placing a sensor at a candidate position.
 * Rewards cells that gain multi-EO visibility (2+ EO sensors), which
 * enables triangulation.
 *
 * Score breakdown:
 *   - Cells with 0 EO sensors: 0 contribution
 *   - Cells with 1 EO sensor: 0.3 contribution (single EO, bearing-only)
 *   - Cells with 2 EO sensors: 0.8 contribution (triangulation possible)
 *   - Cells with 3+ EO sensors: 1.0 contribution (redundant triangulation)
 *
 * @param candidatePos - Where to place the sensor.
 * @param sensor - Sensor specification (scored only for EO sensors).
 * @param cells - All grid cells.
 * @param placedSensors - Already-placed sensors.
 * @returns Score between 0 and 1.
 */
export function eoCoverageScore(
  candidatePos: GeoPoint,
  sensor: SensorSpec,
  cells: GridCell[],
  placedSensors: PlacedSensor[],
): number {
  if (cells.length === 0) return 0;

  // If the candidate is not an EO sensor, it doesn't contribute to EO coverage
  if (sensor.type !== 'eo') return 0;

  const VISIBILITY_WEIGHTS: Record<number, number> = {
    0: 0,
    1: 0.3,
    2: 0.8,
  };

  let totalScore = 0;

  for (const cell of cells) {
    const count = eoVisibilityCount(cell, candidatePos, sensor, placedSensors);
    if (count === 0) continue;

    const weight = count >= 3 ? 1.0 : (VISIBILITY_WEIGHTS[count] ?? 0);
    totalScore += weight;
  }

  return totalScore / cells.length;
}
