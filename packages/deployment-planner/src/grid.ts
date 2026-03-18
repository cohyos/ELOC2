/**
 * Grid discretization: divide a polygon into candidate cells.
 */
import type { GeoPoint, GeoPolygon, GridCell } from './types.js';
import { pointInPolygon } from './constraints.js';

/** Meters per degree latitude (approximate). */
const METERS_PER_DEG_LAT = 111_320;

/** Meters per degree longitude at a given latitude. */
function metersPerDegLon(latDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

/**
 * Compute the bounding box of a polygon.
 */
export function boundingBox(polygon: GeoPolygon): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Generate a grid of candidate cells inside a polygon at the given resolution.
 * @param polygon - The area boundary.
 * @param resolutionM - Grid cell spacing in meters.
 * @returns Array of GridCell whose centers are inside the polygon.
 */
export function generateGrid(polygon: GeoPolygon, resolutionM: number): GridCell[] {
  if (polygon.length < 3) return [];

  const bb = boundingBox(polygon);
  const centerLat = (bb.minLat + bb.maxLat) / 2;

  const dLat = resolutionM / METERS_PER_DEG_LAT;
  const dLon = resolutionM / metersPerDegLon(centerLat);

  const cells: GridCell[] = [];
  let index = 0;

  let row = 0;
  for (let lat = bb.minLat + dLat / 2; lat <= bb.maxLat; lat += dLat) {
    let col = 0;
    for (let lon = bb.minLon + dLon / 2; lon <= bb.maxLon; lon += dLon) {
      const center: GeoPoint = { lat, lon };
      if (pointInPolygon(center, polygon)) {
        cells.push({ index, center, row, col });
        index++;
      }
      col++;
    }
    row++;
  }

  return cells;
}

/**
 * Haversine distance between two points in meters.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const aLat = (a.lat * Math.PI) / 180;
  const bLat = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
