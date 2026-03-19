/**
 * SRTM DEM tile loader.
 *
 * Each SRTM 1-arc-second (30 m) HGT tile covers 1° x 1° and contains a
 * 3601 x 3601 grid of Int16 big-endian elevation samples (in metres).
 *
 * Tiles are lazily loaded on first access to keep memory usage low
 * (important for Cloud Run's 512 MiB limit).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Number of samples per row/column in an SRTM 1-arc-second tile. */
const TILE_SIZE = 3601;

/** Expected byte length of one HGT tile (3601 * 3601 * 2). */
const EXPECTED_BYTES = TILE_SIZE * TILE_SIZE * 2;

/** SRTM void (no-data) sentinel value. */
const VOID_VALUE = -32768;

// ---------------------------------------------------------------------------
// Tile cache — keyed by "N31E034" style names
// ---------------------------------------------------------------------------

const tileCache = new Map<string, Int16Array>();

/**
 * Build the canonical SRTM tile name for a given lat/lon.
 *
 * The tile name encodes the *south-west corner* of the 1° cell.
 * E.g. lat 31.5, lon 34.2 → "N31E034".
 */
export function tileName(lat: number, lon: number): string {
  const latFloor = Math.floor(lat);
  const lonFloor = Math.floor(lon);
  const ns = latFloor >= 0 ? 'N' : 'S';
  const ew = lonFloor >= 0 ? 'E' : 'W';
  const latStr = String(Math.abs(latFloor)).padStart(2, '0');
  const lonStr = String(Math.abs(lonFloor)).padStart(3, '0');
  return `${ns}${latStr}${ew}${lonStr}`;
}

/**
 * Load an SRTM HGT tile from disk into the cache.
 *
 * @param lat - Any latitude inside the desired 1° cell.
 * @param lon - Any longitude inside the desired 1° cell.
 * @param dataDir - Directory containing `.hgt` files.
 * @returns `true` if the tile was loaded successfully.
 */
export function loadTile(lat: number, lon: number, dataDir: string): boolean {
  const name = tileName(lat, lon);
  if (tileCache.has(name)) return true;

  const filePath = join(dataDir, `${name}.hgt`);
  try {
    const buf = readFileSync(filePath);
    if (buf.byteLength !== EXPECTED_BYTES) {
      console.warn(
        `[terrain] ${filePath}: unexpected size ${buf.byteLength} (expected ${EXPECTED_BYTES})`,
      );
      return false;
    }

    // Convert from big-endian Int16 to platform-native Int16Array.
    const samples = new Int16Array(TILE_SIZE * TILE_SIZE);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, false /* big-endian */);
    }

    tileCache.set(name, samples);
    return true;
  } catch {
    // File not found or unreadable — graceful degradation.
    return false;
  }
}

/**
 * Manually inject a tile into the cache (useful for testing).
 */
export function injectTile(name: string, data: Int16Array): void {
  tileCache.set(name, data);
}

/**
 * Remove all cached tiles (useful for testing).
 */
export function clearTiles(): void {
  tileCache.clear();
}

/**
 * Returns `true` when at least one DEM tile is loaded.
 */
export function isLoaded(): boolean {
  return tileCache.size > 0;
}

/**
 * Returns the number of cached tiles.
 */
export function tileCount(): number {
  return tileCache.size;
}

/**
 * Query the terrain elevation at a given WGS-84 position.
 *
 * Uses bilinear interpolation across the four nearest grid samples.
 *
 * @returns Elevation in metres, or `undefined` if no tile is loaded for that
 *          position or the sample is a void.
 */
export function getElevation(lat: number, lon: number): number | undefined {
  const name = tileName(lat, lon);
  const tile = tileCache.get(name);
  if (!tile) return undefined;

  const latFloor = Math.floor(lat);
  const lonFloor = Math.floor(lon);

  // Fractional position within the tile (0..3600).
  // Row 0 is the *north* edge of the tile (latFloor + 1).
  const rowF = (latFloor + 1 - lat) * (TILE_SIZE - 1);
  const colF = (lon - lonFloor) * (TILE_SIZE - 1);

  const row0 = Math.floor(rowF);
  const col0 = Math.floor(colF);
  const row1 = Math.min(row0 + 1, TILE_SIZE - 1);
  const col1 = Math.min(col0 + 1, TILE_SIZE - 1);

  const dr = rowF - row0;
  const dc = colF - col0;

  const z00 = tile[row0 * TILE_SIZE + col0];
  const z01 = tile[row0 * TILE_SIZE + col1];
  const z10 = tile[row1 * TILE_SIZE + col0];
  const z11 = tile[row1 * TILE_SIZE + col1];

  // If any corner is void, return undefined.
  if (z00 === VOID_VALUE || z01 === VOID_VALUE || z10 === VOID_VALUE || z11 === VOID_VALUE) {
    return undefined;
  }

  // Bilinear interpolation.
  const z = z00 * (1 - dr) * (1 - dc)
          + z01 * (1 - dr) * dc
          + z10 * dr * (1 - dc)
          + z11 * dr * dc;

  return z;
}
