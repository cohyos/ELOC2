import type { ScenarioDefinition } from '../types.js';

/**
 * Ballistic Missile Scenario
 *
 * Single ballistic target launched from 150 km range with a realistic
 * parabolic trajectory (high altitude, fast descent). Tests long-range
 * detection, high-speed tracking, and track maintenance during maneuver.
 *
 * 2 long-range radars (200 km), 2 EO sensors.
 * Duration: 120 seconds.
 */
export const ballistic: ScenarioDefinition = {
  id: 'ballistic',
  name: 'Ballistic Missile',
  description:
    'Single ballistic target launched from 150 km range with parabolic trajectory. ' +
    'Tests long-range detection, high-speed tracking, and track maintenance during ' +
    'altitude changes. 2 long-range radars, 2 EO sensors, 120 seconds.',
  durationSec: 120,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    {
      sensorId: 'RADAR-BM-1',
      type: 'radar',
      position: { lat: 31.5, lon: 34.8, alt: 80 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 200_000,
      },
    },
    {
      sensorId: 'RADAR-BM-2',
      type: 'radar',
      position: { lat: 31.3, lon: 35.0, alt: 60 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 200_000,
      },
    },
    {
      sensorId: 'EO-BM-1',
      type: 'eo',
      position: { lat: 31.5, lon: 34.8, alt: 80 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 30_000,
      },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'EO-BM-2',
      type: 'eo',
      position: { lat: 31.3, lon: 35.0, alt: 60 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 30_000,
      },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],

  // ── Targets ──────────────────────────────────────────────────────────
  // Parabolic trajectory: launch from north, climb to ~80 km apex, descend.
  // ~150 km ground distance. Waypoints approximate the ballistic arc.
  // Speed ramps from ~1500 m/s at launch, ~800 m/s at apex, ~2000 m/s terminal.
  targets: [
    {
      targetId: 'TGT-BM-1',
      name: 'Ballistic Missile',
      description:
        'Single ballistic target with parabolic trajectory. Launched from 150 km north, ' +
        'climbs to 80 km altitude at apex, then descends rapidly toward defense point.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        // Launch — low altitude, high initial speed heading south
        { time: 0, position: { lat: 32.85, lon: 34.8, alt: 5000 }, velocity: { vx: 0, vy: -1500, vz: 800 } },
        // Boost phase — climbing rapidly
        { time: 15, position: { lat: 32.65, lon: 34.8, alt: 25000 }, velocity: { vx: 0, vy: -1200, vz: 600 } },
        // Mid-course — near apex
        { time: 35, position: { lat: 32.35, lon: 34.8, alt: 60000 }, velocity: { vx: 0, vy: -900, vz: 200 } },
        // Apex — maximum altitude, minimum speed
        { time: 50, position: { lat: 32.10, lon: 34.8, alt: 80000 }, velocity: { vx: 0, vy: -800, vz: 0 } },
        // Descent — accelerating downward
        { time: 70, position: { lat: 31.85, lon: 34.8, alt: 55000 }, velocity: { vx: 0, vy: -1000, vz: -500 } },
        // Terminal phase — steep dive, high speed
        { time: 90, position: { lat: 31.65, lon: 34.8, alt: 25000 }, velocity: { vx: 0, vy: -1500, vz: -1200 } },
        // Terminal — near impact
        { time: 110, position: { lat: 31.52, lon: 34.8, alt: 5000 }, velocity: { vx: 0, vy: -2000, vz: -1800 } },
        // Impact
        { time: 120, position: { lat: 31.50, lon: 34.8, alt: 100 }, velocity: { vx: 0, vy: -2000, vz: -2000 } },
      ],
    },
  ],

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'sensor_outage',
      sensorId: 'RADAR-BM-2',
      startTime: 40,
      endTime: 55, // 15-second dropout during mid-course phase
    },
  ],

  // ── Operator Actions ─────────────────────────────────────────────────
  operatorActions: [],
};
