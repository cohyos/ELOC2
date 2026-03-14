import { describe, it, expect } from 'vitest';
import type { GimbalState, SystemTrackId } from '@eloc2/domain';
import { GimbalController } from '../gimbal-model/gimbal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGimbalState(overrides: Partial<GimbalState> = {}): GimbalState {
  return {
    azimuthDeg: 0,
    elevationDeg: 10,
    slewRateDegPerSec: 30,
    currentTargetId: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GimbalController', () => {
  describe('slewTo', () => {
    it('should compute correct slew time for a 90-degree azimuth slew', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 0, elevationDeg: 0, slewRateDegPerSec: 30 }),
      );

      const result = controller.slewTo(90, 0);

      // 90 degrees at 30 deg/s = 3 seconds = 3000 ms
      expect(result.slewTimeMs).toBeCloseTo(3000, 0);
      expect(result.canReach).toBe(true);
    });

    it('should report canReach=false for elevation > 85 degrees', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState(),
      );

      const result = controller.slewTo(0, 90);
      expect(result.canReach).toBe(false);
    });

    it('should report canReach=false for elevation < -5 degrees', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState(),
      );

      const result = controller.slewTo(0, -10);
      expect(result.canReach).toBe(false);
    });

    it('should report canReach=true for elevation within [-5, 85]', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState(),
      );

      expect(controller.slewTo(0, -5).canReach).toBe(true);
      expect(controller.slewTo(0, 85).canReach).toBe(true);
      expect(controller.slewTo(0, 40).canReach).toBe(true);
    });

    it('should handle azimuth wrap-around (350 to 10 = 20 deg)', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 350, slewRateDegPerSec: 20 }),
      );

      const result = controller.slewTo(10, 10);
      // Shortest path from 350 to 10 is 20 degrees
      // 20 deg / 20 deg/s = 1 second = 1000 ms
      expect(result.slewTimeMs).toBeCloseTo(1000, 0);
    });
  });

  describe('isInFov', () => {
    it('should return true for a target within the FOV', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 45, elevationDeg: 10 }),
      );

      const fov = { halfAngleHDeg: 5, halfAngleVDeg: 3 };
      expect(controller.isInFov(46, 11, fov)).toBe(true);
    });

    it('should return false for a target outside the FOV', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 45, elevationDeg: 10 }),
      );

      const fov = { halfAngleHDeg: 5, halfAngleVDeg: 3 };
      // 20 degrees off in azimuth — way outside the 5-degree half-angle
      expect(controller.isInFov(65, 10, fov)).toBe(false);
    });

    it('should handle azimuth wrap-around in FOV check', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 359, elevationDeg: 0 }),
      );

      const fov = { halfAngleHDeg: 5, halfAngleVDeg: 5 };
      // 2 degrees azimuth should be within FOV (shortest path from 359 to 2 is 3 deg)
      expect(controller.isInFov(2, 0, fov)).toBe(true);
    });
  });

  describe('slewToTarget', () => {
    it('should compute azimuth and elevation to a target position', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 0 },
        makeGimbalState({ azimuthDeg: 0, elevationDeg: 0 }),
      );

      // Target directly north and at higher altitude
      const result = controller.slewToTarget({ lat: 32.1, lon: 34.0, alt: 1000 });

      // Azimuth should be roughly north (~0 degrees)
      expect(result.azimuthDeg).toBeCloseTo(0, 0);
      // Elevation should be positive (target is above)
      expect(result.elevationDeg).toBeGreaterThan(0);
      expect(result.canReach).toBe(true);
    });
  });

  describe('applySlew', () => {
    it('should update gimbal state to new angles', () => {
      const controller = new GimbalController(
        { lat: 32.0, lon: 34.0, alt: 50 },
        makeGimbalState({ azimuthDeg: 0, elevationDeg: 0 }),
      );

      controller.applySlew(90, 30);
      const pointing = controller.getCurrentPointing();

      expect(pointing.azimuthDeg).toBe(90);
      expect(pointing.elevationDeg).toBe(30);
    });
  });
});
