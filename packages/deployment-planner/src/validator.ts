/**
 * Compute aggregate metrics for a deployment.
 */
import type { PlacedSensor, GridCell, DeploymentMetrics } from './types.js';
import { haversineDistance } from './grid.js';
import { isCellCovered } from './coverage-scorer.js';
import { intersectionAngleQuality } from './geometry-scorer.js';

/**
 * Validate a deployment by computing aggregate metrics.
 * @param placed - Sensors that have been placed.
 * @param cells - All grid cells in the scanned area.
 * @returns DeploymentMetrics with coverage, triangulation, gap, and geometry quality.
 */
export function validateDeployment(
  placed: PlacedSensor[],
  cells: GridCell[],
): DeploymentMetrics {
  if (cells.length === 0) {
    return { coveragePercent: 0, triangulationCoveragePercent: 0, worstCaseGapM: 0, geometryQuality: 0 };
  }

  // Per-cell: how many sensors cover it
  const coverCount = new Array<number>(cells.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    for (const s of placed) {
      if (isCellCovered(s.position, s.spec, cells[i])) {
        coverCount[i]++;
      }
    }
  }

  // Coverage %
  const coveredCells = coverCount.filter(c => c >= 1).length;
  const coveragePercent = (coveredCells / cells.length) * 100;

  // Triangulation coverage % (cells with 2+ sensor coverage)
  const triCells = coverCount.filter(c => c >= 2).length;
  const triangulationCoveragePercent = (triCells / cells.length) * 100;

  // Worst-case gap: find the uncovered cell that is farthest from any sensor
  let worstCaseGapM = 0;
  for (let i = 0; i < cells.length; i++) {
    if (coverCount[i] === 0) {
      let minDist = Infinity;
      for (const s of placed) {
        const d = haversineDistance(s.position, cells[i].center);
        if (d < minDist) minDist = d;
      }
      if (minDist > worstCaseGapM) worstCaseGapM = minDist;
    }
  }

  // Average geometry quality across cells with 2+ coverage
  let totalGeoQ = 0;
  let geoCount = 0;
  for (let i = 0; i < cells.length; i++) {
    if (coverCount[i] >= 2) {
      // Find all sensors covering this cell and compute best pair quality
      const coveringSensors = placed.filter(s => isCellCovered(s.position, s.spec, cells[i]));
      let bestQ = 0;
      for (let a = 0; a < coveringSensors.length; a++) {
        for (let b = a + 1; b < coveringSensors.length; b++) {
          const q = intersectionAngleQuality(coveringSensors[a].position, coveringSensors[b].position, cells[i]);
          if (q > bestQ) bestQ = q;
        }
      }
      totalGeoQ += bestQ;
      geoCount++;
    }
  }
  const geometryQuality = geoCount > 0 ? totalGeoQ / geoCount : 0;

  return { coveragePercent, triangulationCoveragePercent, worstCaseGapM, geometryQuality };
}
