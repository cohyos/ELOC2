/**
 * Threat corridor exposure scoring.
 * Cells inside threat corridors get higher weight for sensor placement.
 */
import type { GeoPoint, GeoPolygon, SensorSpec, GridCell } from './types.js';
import { pointInPolygon } from './constraints.js';
import { isCellCovered } from './coverage-scorer.js';

/**
 * Compute threat score for placing a sensor at a candidate position.
 * Score = fraction of threat-corridor cells that the sensor covers.
 * @param candidatePos - Where to place the sensor.
 * @param sensor - Sensor specification.
 * @param cells - All grid cells.
 * @param threatCorridors - Polygons representing threat corridors.
 * @returns Score between 0 and 1.
 */
export function threatScore(
  candidatePos: GeoPoint,
  sensor: SensorSpec,
  cells: GridCell[],
  threatCorridors: GeoPolygon[],
): number {
  if (threatCorridors.length === 0) return 0;

  // Find cells that are inside threat corridors
  const threatCells: GridCell[] = [];
  for (const cell of cells) {
    for (const corridor of threatCorridors) {
      if (pointInPolygon(cell.center, corridor)) {
        threatCells.push(cell);
        break;
      }
    }
  }

  if (threatCells.length === 0) return 0;

  let covered = 0;
  for (const cell of threatCells) {
    if (isCellCovered(candidatePos, sensor, cell)) {
      covered++;
    }
  }

  return covered / threatCells.length;
}
