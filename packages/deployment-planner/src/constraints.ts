/**
 * Inclusion/exclusion zone filtering using ray-casting point-in-polygon.
 */
import type { GeoPoint, GeoPolygon, GridCell } from './types.js';

/**
 * Ray-casting algorithm: determine if a point is inside a polygon.
 * Shoots a ray from the point to the right and counts edge crossings.
 */
export function pointInPolygon(point: GeoPoint, polygon: GeoPolygon): boolean {
  const { lat: y, lon: x } = point;
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lon;
    const yj = polygon[j].lat, xj = polygon[j].lon;

    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Filter grid cells by inclusion/exclusion zones.
 * - If inclusionZones is non-empty, cell must be inside at least one inclusion zone.
 * - Cell must NOT be inside any exclusion zone.
 */
export function filterCells(
  cells: GridCell[],
  inclusionZones: GeoPolygon[],
  exclusionZones: GeoPolygon[],
): GridCell[] {
  return cells.filter(cell => {
    // Exclusion check: reject if in any exclusion zone
    for (const zone of exclusionZones) {
      if (pointInPolygon(cell.center, zone)) return false;
    }

    // Inclusion check: if zones specified, must be in at least one
    if (inclusionZones.length > 0) {
      let inAny = false;
      for (const zone of inclusionZones) {
        if (pointInPolygon(cell.center, zone)) {
          inAny = true;
          break;
        }
      }
      if (!inAny) return false;
    }

    return true;
  });
}
