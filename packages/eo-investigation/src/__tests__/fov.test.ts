import { describe, it, expect } from 'vitest';
import { computeFovFootprint, isTargetInFov } from '../fov-model/fov.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FOV model', () => {
  describe('computeFovFootprint', () => {
    it('should produce a larger footprint at greater range', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      const fov = { halfAngleHDeg: 2, halfAngleVDeg: 1.5 };

      // Pointing at a target at 1000m altitude vs 5000m altitude
      // Higher altitude means greater slant range => larger footprint
      const fp1 = computeFovFootprint(sensor, 0, 30, fov, 1000);
      const fp2 = computeFovFootprint(sensor, 0, 30, fov, 5000);

      expect(fp2.widthM).toBeGreaterThan(fp1.widthM);
      expect(fp2.heightM).toBeGreaterThan(fp1.heightM);
    });

    it('should return positive footprint dimensions', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      const fov = { halfAngleHDeg: 2, halfAngleVDeg: 1.5 };

      const fp = computeFovFootprint(sensor, 45, 20, fov, 3000);

      expect(fp.widthM).toBeGreaterThan(0);
      expect(fp.heightM).toBeGreaterThan(0);
      expect(fp.centerLat).toBeTypeOf('number');
      expect(fp.centerLon).toBeTypeOf('number');
    });

    it('should project center point ahead of sensor in the given azimuth direction', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      const fov = { halfAngleHDeg: 2, halfAngleVDeg: 1.5 };

      // Pointing due north (az=0)
      const fpNorth = computeFovFootprint(sensor, 0, 30, fov, 5000);
      expect(fpNorth.centerLat).toBeGreaterThan(sensor.lat);

      // Pointing due east (az=90)
      const fpEast = computeFovFootprint(sensor, 90, 30, fov, 5000);
      expect(fpEast.centerLon).toBeGreaterThan(sensor.lon);
    });
  });

  describe('isTargetInFov', () => {
    it('should return true for a target directly ahead', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      // Target 10 km north at 1000 m altitude
      // Horizontal distance ~ 10 km, elevation ~ atan2(1000, 10000) ~ 5.7 deg
      const target = { lat: 32.09, lon: 34.0, alt: 1000 };
      const fov = { halfAngleHDeg: 5, halfAngleVDeg: 8 };

      // Gimbal pointing north at ~5.7 deg elevation
      const result = isTargetInFov(sensor, 0, 5.7, fov, target);
      expect(result).toBe(true);
    });

    it('should return false for a target 90 degrees off-axis', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      // Target due east
      const target = { lat: 32.0, lon: 34.01, alt: 0 };
      const fov = { halfAngleHDeg: 5, halfAngleVDeg: 5 };

      // Gimbal pointing due north
      const result = isTargetInFov(sensor, 0, 0, fov, target);
      expect(result).toBe(false);
    });

    it('should return false for a target outside the FOV in elevation', () => {
      const sensor = { lat: 32.0, lon: 34.0, alt: 0 };
      const fov = { halfAngleHDeg: 2, halfAngleVDeg: 2 };

      // Target 10 km north at 5000m altitude
      // elevation ~ atan2(5000, 10000) ~ 26.5 deg, well beyond the 2-deg half-angle
      const target = { lat: 32.09, lon: 34.0, alt: 5000 };

      // Gimbal pointing north, 0 elevation
      const result = isTargetInFov(sensor, 0, 0, fov, target);
      expect(result).toBe(false);
    });
  });
});
