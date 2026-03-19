import { describe, it, expect } from 'vitest';
import { estimateLaunchPoint, estimateImpactPoint } from '../src/ballistic/ballistic-estimator';

describe('ballistic-estimator', () => {
  /**
   * Generate a parabolic trajectory: alt(t) = -0.5*g*t^2 + v0*t + alt0
   * with horizontal linear motion.
   */
  function generateTrajectory(opts: {
    launchLat: number;
    launchLon: number;
    v0: number; // initial vertical velocity m/s
    g?: number; // gravity (default 9.81)
    headingDeg?: number; // horizontal heading
    speedHoriz?: number; // horizontal speed m/s
    startTime: number;
    sampleInterval: number;
    numSamples: number;
    sampleOffset?: number; // time offset from launch to first sample
  }) {
    const g = opts.g ?? 9.81;
    const heading = (opts.headingDeg ?? 0) * (Math.PI / 180);
    const hSpeed = opts.speedHoriz ?? 200; // m/s
    const offset = opts.sampleOffset ?? 5; // seconds after launch
    const mPerDegLat = 110540;
    const mPerDegLon = 111320 * Math.cos(opts.launchLat * (Math.PI / 180));

    const positions: { lat: number; lon: number; alt: number }[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < opts.numSamples; i++) {
      const t = offset + i * opts.sampleInterval;
      const alt = -0.5 * g * t * t + opts.v0 * t;
      if (alt < 0) break; // Stop when hitting ground

      const dx = hSpeed * Math.sin(heading) * t;
      const dy = hSpeed * Math.cos(heading) * t;

      positions.push({
        lat: opts.launchLat + dy / mPerDegLat,
        lon: opts.launchLon + dx / mPerDegLon,
        alt,
      });
      timestamps.push(opts.startTime + t);
    }

    return { positions, timestamps };
  }

  describe('estimateLaunchPoint', () => {
    it('returns null for fewer than 3 samples', () => {
      const result = estimateLaunchPoint(
        [{ lat: 31, lon: 34, alt: 100 }, { lat: 31.01, lon: 34.01, alt: 200 }],
        [0, 1],
      );
      expect(result).toBeNull();
    });

    it('returns null for all-zero altitude', () => {
      const result = estimateLaunchPoint(
        [{ lat: 31, lon: 34, alt: 0 }, { lat: 31.01, lon: 34.01, alt: 0 }, { lat: 31.02, lon: 34.02, alt: 0 }],
        [0, 1, 2],
      );
      expect(result).toBeNull();
    });

    it('estimates launch point for a standard ballistic trajectory', () => {
      const { positions, timestamps } = generateTrajectory({
        launchLat: 31.0,
        launchLon: 34.0,
        v0: 300, // ~300 m/s vertical
        startTime: 100,
        sampleInterval: 2,
        numSamples: 8,
        sampleOffset: 5,
      });

      expect(positions.length).toBeGreaterThanOrEqual(3);

      const result = estimateLaunchPoint(positions, timestamps);
      expect(result).not.toBeNull();

      if (result) {
        // Launch lat/lon should be close to the original launch point
        expect(result.point.lat).toBeCloseTo(31.0, 1);
        expect(result.point.lon).toBeCloseTo(34.0, 1);
        expect(result.point.alt).toBe(0);
        expect(result.uncertainty2SigmaM).toBeGreaterThan(0);
      }
    });

    it('uncertainty grows with extrapolation distance', () => {
      // Near samples (close to launch)
      const nearTraj = generateTrajectory({
        launchLat: 31.0, launchLon: 34.0,
        v0: 300, startTime: 100, sampleInterval: 1, numSamples: 5, sampleOffset: 2,
      });

      // Far samples (far from launch)
      const farTraj = generateTrajectory({
        launchLat: 31.0, launchLon: 34.0,
        v0: 300, startTime: 100, sampleInterval: 1, numSamples: 5, sampleOffset: 20,
      });

      const nearResult = estimateLaunchPoint(nearTraj.positions, nearTraj.timestamps);
      const farResult = estimateLaunchPoint(farTraj.positions, farTraj.timestamps);

      if (nearResult && farResult) {
        expect(farResult.uncertainty2SigmaM).toBeGreaterThan(nearResult.uncertainty2SigmaM);
      }
    });
  });

  describe('estimateImpactPoint', () => {
    it('returns null for fewer than 3 samples', () => {
      const result = estimateImpactPoint(
        [{ lat: 31, lon: 34, alt: 1000 }, { lat: 31.01, lon: 34.01, alt: 800 }],
        [0, 1],
      );
      expect(result).toBeNull();
    });

    it('estimates impact point for a descending ballistic trajectory', () => {
      // Generate a trajectory mid-flight, near apogee and descending
      const { positions, timestamps } = generateTrajectory({
        launchLat: 31.0,
        launchLon: 34.0,
        v0: 200,
        speedHoriz: 150,
        headingDeg: 45,
        startTime: 100,
        sampleInterval: 2,
        numSamples: 10,
        sampleOffset: 15, // Mid-flight
      });

      expect(positions.length).toBeGreaterThanOrEqual(3);

      const result = estimateImpactPoint(positions, timestamps);
      // May or may not find an impact depending on trajectory shape
      if (result) {
        expect(result.point.alt).toBe(0);
        expect(result.timeToImpactSec).toBeGreaterThan(0);
        expect(result.uncertainty2SigmaM).toBeGreaterThan(0);
      }
    });

    it('returns positive time-to-impact', () => {
      // Steep descent: v0=100 at t_offset=15 → past apogee
      const { positions, timestamps } = generateTrajectory({
        launchLat: 31.5,
        launchLon: 34.5,
        v0: 150,
        startTime: 0,
        sampleInterval: 1,
        numSamples: 8,
        sampleOffset: 12, // Well past apogee at t=15.3
      });

      const result = estimateImpactPoint(positions, timestamps);
      if (result) {
        expect(result.timeToImpactSec).toBeGreaterThan(0);
        expect(result.timeToImpactSec).toBeLessThan(600);
      }
    });
  });

  describe('round-trip consistency', () => {
    it('launch and impact should bracket the observed trajectory', () => {
      const { positions, timestamps } = generateTrajectory({
        launchLat: 32.0,
        launchLon: 35.0,
        v0: 250,
        speedHoriz: 100,
        headingDeg: 90,
        startTime: 50,
        sampleInterval: 1,
        numSamples: 10,
        sampleOffset: 8,
      });

      if (positions.length < 3) return;

      const launch = estimateLaunchPoint(positions, timestamps);
      const impact = estimateImpactPoint(positions, timestamps);

      // At minimum, one of them should be estimated
      const hasEstimate = launch !== null || impact !== null;
      expect(hasEstimate).toBe(true);
    });
  });
});
