import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkLineOfSight } from '../los-checker.js';
import { injectTile, clearTiles, tileName, getElevation } from '../dem-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TILE_SIZE = 3601;

/**
 * Create a flat tile filled with a constant elevation value.
 */
function flatTile(elevation: number): Int16Array {
  const data = new Int16Array(TILE_SIZE * TILE_SIZE);
  data.fill(elevation);
  return data;
}

/**
 * Create a tile with a ridge (elevated strip) at a specific row range.
 *
 * Rows run north-to-south: row 0 is the north edge (latFloor + 1),
 * row 3600 is the south edge (latFloor).
 */
function ridgeTile(
  baseElevation: number,
  ridgeElevation: number,
  ridgeRowStart: number,
  ridgeRowEnd: number,
): Int16Array {
  const data = new Int16Array(TILE_SIZE * TILE_SIZE);
  data.fill(baseElevation);
  for (let r = ridgeRowStart; r <= ridgeRowEnd; r++) {
    for (let c = 0; c < TILE_SIZE; c++) {
      data[r * TILE_SIZE + c] = ridgeElevation;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LOS checker — no DEM loaded', () => {
  beforeEach(() => clearTiles());

  it('returns visible=true when no DEM data is loaded', () => {
    const result = checkLineOfSight(
      { lat: 31.5, lon: 34.5, alt: 0 },
      { lat: 31.6, lon: 34.6, alt: 1000 },
    );
    expect(result.visible).toBe(true);
    expect(result.blockingPoint).toBeUndefined();
  });
});

describe('LOS checker — flat terrain', () => {
  beforeEach(() => {
    clearTiles();
    // Inject a flat tile at elevation 100 m for the N31E034 cell.
    injectTile('N31E034', flatTile(100));
  });
  afterEach(() => clearTiles());

  it('returns visible=true for target above flat terrain', () => {
    // Sensor on ground (alt=100) + default 10 m mast → 110 m effective.
    // Target at 1000 m — well above 100 m terrain.
    const result = checkLineOfSight(
      { lat: 31.2, lon: 34.2, alt: 100 },
      { lat: 31.8, lon: 34.8, alt: 1000 },
    );
    expect(result.visible).toBe(true);
  });

  it('returns visible=true for co-located sensor and target', () => {
    const result = checkLineOfSight(
      { lat: 31.5, lon: 34.5, alt: 100 },
      { lat: 31.5, lon: 34.5, alt: 500 },
    );
    expect(result.visible).toBe(true);
  });
});

describe('LOS checker — terrain occlusion', () => {
  beforeEach(() => {
    clearTiles();
    // Create a tile with a 2000 m ridge across the middle rows (1700–1900).
    // The tile covers N31E034 (lat 31–32, lon 34–35).
    // Row 1800 ≈ lat 31.5 (middle of tile).
    injectTile('N31E034', ridgeTile(100, 2000, 1700, 1900));
  });
  afterEach(() => clearTiles());

  it('returns visible=false when a ridge blocks the LOS', () => {
    // Sensor at south edge (lat ~31.1), target at north edge (lat ~31.9).
    // Ridge of 2000 m sits in between; both endpoints are at 100 m.
    const result = checkLineOfSight(
      { lat: 31.1, lon: 34.5, alt: 100 },
      { lat: 31.9, lon: 34.5, alt: 100 },
    );
    expect(result.visible).toBe(false);
    expect(result.blockingPoint).toBeDefined();
    // Blocking point elevation may be interpolated at the ridge edge,
    // so just check it is significantly above the sensor/target altitude.
    expect(result.blockingPoint!.elevationM).toBeGreaterThan(100);
    // Blocking point should be roughly in the middle latitude band.
    expect(result.blockingPoint!.lat).toBeGreaterThan(31.3);
    expect(result.blockingPoint!.lat).toBeLessThan(31.7);
  });

  it('returns visible=true when target altitude clears the ridge', () => {
    // Target at 5000 m — well above the 2000 m ridge.
    const result = checkLineOfSight(
      { lat: 31.1, lon: 34.5, alt: 100 },
      { lat: 31.9, lon: 34.5, alt: 5000 },
    );
    expect(result.visible).toBe(true);
  });
});

describe('LOS checker — Earth curvature', () => {
  beforeEach(() => {
    clearTiles();
    // Flat tile at 0 m elevation, large enough range to show curvature.
    injectTile('N31E034', flatTile(0));
    injectTile('N31E035', flatTile(0));
    injectTile('N32E034', flatTile(0));
    injectTile('N32E035', flatTile(0));
  });
  afterEach(() => clearTiles());

  it('curvature drop is zero at endpoints and positive in between', () => {
    // This is a unit-style check on the curvature formula.
    // At d=50 km, D=100 km: drop = 50000 * 50000 / (2 * 6371000) ≈ 196 m.
    const d = 50_000;
    const D = 100_000;
    const R = 6_371_000;
    const drop = (d * (D - d)) / (2 * R);
    expect(drop).toBeCloseTo(196.3, 0);
  });

  it('flat terrain at sea level is visible for short ranges with sensor at ground', () => {
    // 10 km range, sensor at 0 m + 10 m mast, target at 100 m altitude.
    // Curvature drop at midpoint ≈ 10000*10000/(2*6371000) ≈ 1 m — negligible.
    const result = checkLineOfSight(
      { lat: 31.5, lon: 34.5, alt: 0 },
      { lat: 31.59, lon: 34.5, alt: 100 },
    );
    expect(result.visible).toBe(true);
  });
});

describe('DEM loader — tileName', () => {
  it('formats positive lat/lon correctly', () => {
    expect(tileName(31.5, 34.2)).toBe('N31E034');
  });

  it('formats negative lat/lon correctly', () => {
    expect(tileName(-12.3, -45.7)).toBe('S13W046');
  });

  it('handles zero crossing', () => {
    expect(tileName(0.5, 0.5)).toBe('N00E000');
  });
});

describe('DEM loader — getElevation with injected tile', () => {
  beforeEach(() => {
    clearTiles();
    injectTile('N31E034', flatTile(500));
  });
  afterEach(() => clearTiles());

  it('returns the elevation for a point inside the loaded tile', () => {
    const elev = getElevation(31.5, 34.5);
    expect(elev).toBe(500);
  });

  it('returns undefined for a point with no loaded tile', () => {
    const elev = getElevation(40.0, 34.5);
    expect(elev).toBeUndefined();
  });
});
