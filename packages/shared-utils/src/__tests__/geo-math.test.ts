import { describe, it, expect } from "vitest";
import {
  geodeticToECEF,
  ecefToGeodetic,
  geodeticToENU,
  enuToGeodetic,
  haversineDistanceM,
  bearingDeg,
  clampAngle,
  normalizeLon,
  WGS84_A,
} from "../geo-math.js";

describe("geodeticToECEF", () => {
  it("converts (0, 0, 0) to approximately (WGS84_A, 0, 0)", () => {
    const result = geodeticToECEF(0, 0, 0);
    expect(result.x).toBeCloseTo(WGS84_A, 0);
    expect(result.y).toBeCloseTo(0, 0);
    expect(result.z).toBeCloseTo(0, 0);
  });

  it("converts the North Pole (90, 0, 0) to approximately (0, 0, ~6356752)", () => {
    const result = geodeticToECEF(90, 0, 0);
    // Semi-minor axis b ≈ 6356752.314 m
    expect(result.x).toBeCloseTo(0, 0);
    expect(result.y).toBeCloseTo(0, 0);
    expect(result.z).toBeCloseTo(6356752.314, 0);
  });

  it("round-trips through ecefToGeodetic", () => {
    const lat = 32.0853;
    const lon = 34.7818;
    const alt = 100;

    const ecef = geodeticToECEF(lat, lon, alt);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);

    expect(back.lat).toBeCloseTo(lat, 6);
    expect(back.lon).toBeCloseTo(lon, 6);
    expect(back.alt).toBeCloseTo(alt, 2);
  });
});

describe("haversineDistanceM", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceM(40, -74, 40, -74)).toBeCloseTo(0, 5);
  });

  it("computes approximately 111 km for 1 degree of latitude along a meridian", () => {
    const dist = haversineDistanceM(0, 0, 1, 0);
    // 1 degree of latitude ≈ 111195 m on the WGS84 sphere
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("computes known distance between London and Paris (~340 km)", () => {
    // London: 51.5074 N, 0.1278 W  |  Paris: 48.8566 N, 2.3522 E
    const dist = haversineDistanceM(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(330_000);
    expect(dist).toBeLessThan(350_000);
  });
});

describe("bearingDeg", () => {
  it("returns ~0 for a target due north", () => {
    const bearing = bearingDeg(40, -74, 41, -74);
    expect(bearing).toBeCloseTo(0, 0);
  });

  it("returns ~90 for a target due east at the equator", () => {
    const bearing = bearingDeg(0, 0, 0, 1);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it("returns ~180 for a target due south", () => {
    const bearing = bearingDeg(41, -74, 40, -74);
    expect(bearing).toBeCloseTo(180, 0);
  });
});

describe("normalizeLon", () => {
  it("returns values already in (-180, 180] unchanged", () => {
    expect(normalizeLon(34.78)).toBeCloseTo(34.78);
    expect(normalizeLon(-74.0)).toBeCloseTo(-74.0);
    expect(normalizeLon(180)).toBeCloseTo(180);
  });

  it("wraps 181 to -179", () => {
    expect(normalizeLon(181)).toBeCloseTo(-179);
  });

  it("wraps -181 to 179", () => {
    expect(normalizeLon(-181)).toBeCloseTo(179);
  });

  it("wraps 360 to 0", () => {
    expect(normalizeLon(360)).toBeCloseTo(0);
  });

  it("wraps 540 to 180", () => {
    expect(normalizeLon(540)).toBeCloseTo(180);
  });

  it("wraps -360 to 0", () => {
    expect(normalizeLon(-360)).toBeCloseTo(0);
  });
});

describe("longitude ±180° wrap-around", () => {
  it("haversineDistanceM: short distance across antimeridian", () => {
    // Two points 2° apart straddling the antimeridian
    const dist = haversineDistanceM(0, 179, 0, -179);
    const expected = haversineDistanceM(0, 0, 0, 2);
    expect(dist).toBeCloseTo(expected, 0);
  });

  it("bearingDeg: eastward across antimeridian is ~90°", () => {
    const bearing = bearingDeg(0, 179, 0, -179);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it("bearingDeg: westward across antimeridian is ~270°", () => {
    const bearing = bearingDeg(0, -179, 0, 179);
    expect(bearing).toBeCloseTo(270, 0);
  });

  it("geodeticToECEF → ecefToGeodetic round-trip near antimeridian", () => {
    const lat = 10;
    const lon = 179.5;
    const alt = 500;
    const ecef = geodeticToECEF(lat, lon, alt);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(back.lat).toBeCloseTo(lat, 6);
    expect(back.lon).toBeCloseTo(lon, 6);
    expect(back.alt).toBeCloseTo(alt, 2);
  });

  it("geodeticToECEF → ecefToGeodetic round-trip at -179.5°", () => {
    const lat = -20;
    const lon = -179.5;
    const alt = 1000;
    const ecef = geodeticToECEF(lat, lon, alt);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(back.lat).toBeCloseTo(lat, 6);
    expect(back.lon).toBeCloseTo(lon, 6);
    expect(back.alt).toBeCloseTo(alt, 2);
  });

  it("geodeticToENU handles points across the antimeridian", () => {
    // Point at lon=179, reference at lon=-179 (2° apart)
    const enu = geodeticToENU(0, -179, 0, 0, 179, 0);
    // Should produce ~222 km east, not ~40000 km west
    expect(enu.east).toBeGreaterThan(200_000);
    expect(enu.east).toBeLessThan(250_000);
    expect(Math.abs(enu.north)).toBeLessThan(1);
  });

  it("enuToGeodetic → geodeticToENU round-trip across antimeridian", () => {
    const refLat = 0, refLon = 179.5, refAlt = 0;
    const geo = enuToGeodetic(50000, 0, 0, refLat, refLon, refAlt);
    // Result should be east of antimeridian (negative lon)
    const back = geodeticToENU(geo.lat, geo.lon, geo.alt, refLat, refLon, refAlt);
    expect(back.east).toBeCloseTo(50000, 0);
    expect(Math.abs(back.north)).toBeLessThan(5);
  });
});

describe("clampAngle", () => {
  it("normalizes negative angles", () => {
    expect(clampAngle(-90)).toBeCloseTo(270);
  });

  it("normalizes angles >= 360", () => {
    expect(clampAngle(450)).toBeCloseTo(90);
  });

  it("leaves angles already in [0, 360) unchanged", () => {
    expect(clampAngle(180)).toBeCloseTo(180);
  });
});
