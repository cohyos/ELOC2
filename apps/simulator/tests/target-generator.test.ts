import { describe, it, expect } from 'vitest';
import {
  interpolatePosition,
  interpolateVelocity,
  isTargetActive,
} from '../src/targets/target-generator.js';
import type { WaypointDef, TargetDefinition } from '../src/types/scenario.js';

const waypoints: WaypointDef[] = [
  { time: 0, position: { lat: 34.0, lon: -118.0, alt: 1000 } },
  { time: 10, position: { lat: 34.1, lon: -117.9, alt: 2000 } },
  { time: 20, position: { lat: 34.2, lon: -117.8, alt: 3000 } },
];

describe('interpolatePosition', () => {
  it('returns undefined before first waypoint', () => {
    expect(interpolatePosition(waypoints, -1)).toBeUndefined();
  });

  it('returns undefined after last waypoint', () => {
    expect(interpolatePosition(waypoints, 21)).toBeUndefined();
  });

  it('returns exact position at a waypoint time', () => {
    const pos = interpolatePosition(waypoints, 0);
    expect(pos).toEqual({ lat: 34.0, lon: -118.0, alt: 1000 });
  });

  it('returns exact position at last waypoint', () => {
    const pos = interpolatePosition(waypoints, 20);
    expect(pos).toEqual({ lat: 34.2, lon: -117.8, alt: 3000 });
  });

  it('interpolates midpoint correctly', () => {
    const pos = interpolatePosition(waypoints, 5);
    expect(pos).toBeDefined();
    expect(pos!.lat).toBeCloseTo(34.05, 5);
    expect(pos!.lon).toBeCloseTo(-117.95, 5);
    expect(pos!.alt).toBeCloseTo(1500, 1);
  });

  it('interpolates between second and third waypoint', () => {
    const pos = interpolatePosition(waypoints, 15);
    expect(pos).toBeDefined();
    expect(pos!.lat).toBeCloseTo(34.15, 5);
    expect(pos!.lon).toBeCloseTo(-117.85, 5);
    expect(pos!.alt).toBeCloseTo(2500, 1);
  });

  it('returns undefined for empty waypoints', () => {
    expect(interpolatePosition([], 5)).toBeUndefined();
  });
});

describe('interpolateVelocity', () => {
  it('returns undefined before first waypoint', () => {
    expect(interpolateVelocity(waypoints, -1)).toBeUndefined();
  });

  it('returns undefined after last waypoint', () => {
    expect(interpolateVelocity(waypoints, 21)).toBeUndefined();
  });

  it('computes velocity from position differences when no explicit velocity', () => {
    const vel = interpolateVelocity(waypoints, 5);
    expect(vel).toBeDefined();
    // Should have non-zero components
    expect(vel!.vy).not.toBe(0); // north component (lat change)
    expect(vel!.vx).not.toBe(0); // east component (lon change)
    expect(vel!.vz).toBeCloseTo(100, 0); // 1000m over 10s = 100 m/s
  });

  it('interpolates explicit velocities', () => {
    const wps: WaypointDef[] = [
      {
        time: 0,
        position: { lat: 34.0, lon: -118.0, alt: 1000 },
        velocity: { vx: 10, vy: 20, vz: 0 },
      },
      {
        time: 10,
        position: { lat: 34.1, lon: -117.9, alt: 1000 },
        velocity: { vx: 30, vy: 40, vz: 0 },
      },
    ];
    const vel = interpolateVelocity(wps, 5);
    expect(vel).toBeDefined();
    expect(vel!.vx).toBeCloseTo(20, 5);
    expect(vel!.vy).toBeCloseTo(30, 5);
    expect(vel!.vz).toBeCloseTo(0, 5);
  });

  it('returns undefined for empty waypoints', () => {
    expect(interpolateVelocity([], 5)).toBeUndefined();
  });
});

describe('isTargetActive', () => {
  const target: TargetDefinition = {
    targetId: 'tgt-1',
    name: 'Test Target',
    description: 'A test',
    waypoints,
    startTime: 0,
  };

  it('returns true within the active window', () => {
    expect(isTargetActive(target, 10)).toBe(true);
  });

  it('returns true at exact start', () => {
    expect(isTargetActive(target, 0)).toBe(true);
  });

  it('returns true at exact end', () => {
    expect(isTargetActive(target, 20)).toBe(true);
  });

  it('returns false before start time', () => {
    expect(isTargetActive({ ...target, startTime: 5 }, 3)).toBe(false);
  });

  it('returns false after last waypoint', () => {
    expect(isTargetActive(target, 21)).toBe(false);
  });

  it('returns false for empty waypoints', () => {
    expect(
      isTargetActive({ ...target, waypoints: [] }, 5),
    ).toBe(false);
  });
});
