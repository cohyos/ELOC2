/**
 * Greedy deployment optimizer.
 * Places sensors one at a time, picking the best candidate cell for each.
 */
import type {
  SensorSpec,
  DeploymentConstraints,
  PlacedSensor,
  DeploymentResult,
  GridCell,
} from './types.js';
import { generateGrid } from './grid.js';
import { filterCells } from './constraints.js';
import { coverageScore, isCellCovered } from './coverage-scorer.js';
import { geometryScore } from './geometry-scorer.js';
import { threatScore } from './threat-scorer.js';
import { validateDeployment } from './validator.js';

/** Weights for the scoring components. */
const WEIGHTS = {
  coverage: 0.5,
  geometry: 0.3,
  threat: 0.2,
};

/**
 * Run the greedy placement optimizer.
 * For each sensor to place:
 *   1. Score all valid candidate cells
 *   2. Pick the highest-scoring cell
 *   3. Update coverage mask for remaining placements
 *
 * @param sensors - Sensors to place (in priority order).
 * @param constraints - Deployment constraints (area, zones, etc.).
 * @returns DeploymentResult with placed sensors and aggregate metrics.
 */
export function optimize(
  sensors: SensorSpec[],
  constraints: DeploymentConstraints,
): DeploymentResult {
  const resolution = constraints.gridResolutionM || 1000;
  const allCells = generateGrid(constraints.scannedArea, resolution);
  const validCells = filterCells(allCells, constraints.inclusionZones, constraints.exclusionZones);

  if (validCells.length === 0 || sensors.length === 0) {
    return {
      placedSensors: [],
      metrics: { coveragePercent: 0, triangulationCoveragePercent: 0, worstCaseGapM: Infinity, geometryQuality: 0 },
    };
  }

  // Track which cells are already covered
  const coveredMask = new Array<boolean>(validCells.length).fill(false);
  const placed: PlacedSensor[] = [];

  for (const sensor of sensors) {
    let bestCell: GridCell | null = null;
    let bestScores = { coverage: 0, geometry: 0, threat: 0, total: -Infinity };

    for (const cell of validCells) {
      const cov = coverageScore(cell.center, sensor, validCells, coveredMask);
      const geo = geometryScore(cell.center, placed, validCells);
      const thr = threatScore(cell.center, sensor, validCells, constraints.threatCorridors);

      const total = WEIGHTS.coverage * cov + WEIGHTS.geometry * geo + WEIGHTS.threat * thr;

      if (total > bestScores.total) {
        bestCell = cell;
        bestScores = { coverage: cov, geometry: geo, threat: thr, total };
      }
    }

    if (bestCell) {
      placed.push({
        spec: sensor,
        position: bestCell.center,
        scores: bestScores,
      });

      // Update coverage mask
      for (let i = 0; i < validCells.length; i++) {
        if (!coveredMask[i] && isCellCovered(bestCell.center, sensor, validCells[i])) {
          coveredMask[i] = true;
        }
      }
    }
  }

  const metrics = validateDeployment(placed, validCells);

  return { placedSensors: placed, metrics };
}
