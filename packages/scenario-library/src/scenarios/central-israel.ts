import type { ScenarioDefinition } from '../types.js';

/**
 * Central Israel Defense Sector — the default full-complexity scenario.
 *
 * 6 sensors (2 radar, 3 EO, 1 C4ISR), 8 targets over 15 minutes,
 * 3 fault injections, and 2 operator actions.
 */
export const centralIsrael: ScenarioDefinition = {
  id: 'central-israel',
  name: 'Central Israel Defense Sector',
  description:
    'Full-complexity scenario with 6 sensors, 8 heterogeneous targets, ' +
    'fault injections, and operator actions over a 15-minute engagement.',
  durationSec: 900,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    {
      sensorId: 'RADAR-1',
      type: 'radar',
      position: { lat: 31.0, lon: 34.5, alt: 50 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 200_000,
      },
    },
    {
      sensorId: 'RADAR-2',
      type: 'radar',
      position: { lat: 32.0, lon: 34.8, alt: 30 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 120_000,
      },
    },
    {
      sensorId: 'EO-1',
      type: 'eo',
      position: { lat: 31.0, lon: 34.5, alt: 50 }, // co-located with RADAR-1
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
      sensorId: 'EO-2',
      type: 'eo',
      position: { lat: 31.3, lon: 34.8, alt: 40 }, // ~35 km baseline from EO-1
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
      sensorId: 'EO-3',
      type: 'eo',
      position: { lat: 31.5, lon: 34.3, alt: 60 }, // creates triangle
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
      sensorId: 'C4ISR-1',
      type: 'c4isr',
      position: { lat: 31.5, lon: 35.0, alt: 0 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 500_000, // system-level tracks, effectively unlimited
      },
    },
  ],

  // ── Targets ──────────────────────────────────────────────────────────
  targets: [
    // TGT-1: Straight inbound from N
    {
      targetId: 'TGT-1',
      name: 'Straight Inbound North',
      description: 'Straight-line inbound from north at 8 000 m altitude.',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.5, lon: 34.6, alt: 8000 }, velocity: { vx: 0, vy: -130, vz: 0 } },
        { time: 450, position: { lat: 32.0, lon: 34.6, alt: 8000 } },
        { time: 900, position: { lat: 31.5, lon: 34.6, alt: 8000 } },
      ],
    },
    // TGT-2: Inbound with turn from NE, turns west at T+200s
    {
      targetId: 'TGT-2',
      name: 'NE Inbound with Turn',
      description: 'Approaches from NE, turns west at T+200 s. 6 000 m altitude.',
      startTime: 30,
      waypoints: [
        { time: 0, position: { lat: 32.3, lon: 35.2, alt: 6000 }, velocity: { vx: -80, vy: -100, vz: 0 } },
        { time: 170, position: { lat: 31.8, lon: 34.8, alt: 6000 } },
        { time: 200, position: { lat: 31.75, lon: 34.75, alt: 6000 } }, // turn point
        { time: 500, position: { lat: 31.7, lon: 34.2, alt: 6000 }, velocity: { vx: -120, vy: 0, vz: 0 } },
        { time: 870, position: { lat: 31.7, lon: 33.6, alt: 6000 } },
      ],
    },
    // TGT-3: Fast high-altitude from N (300 m/s, 12 000 m)
    {
      targetId: 'TGT-3',
      name: 'Fast High-Altitude',
      description: 'Fast target from north at 300 m/s, 12 000 m altitude.',
      startTime: 60,
      waypoints: [
        { time: 0, position: { lat: 32.8, lon: 34.6, alt: 12000 }, velocity: { vx: 0, vy: -300, vz: 0 } },
        { time: 420, position: { lat: 31.6, lon: 34.6, alt: 12000 } },
        { time: 840, position: { lat: 30.4, lon: 34.6, alt: 12000 } },
      ],
    },
    // TGT-4a: Formation pair A
    {
      targetId: 'TGT-4a',
      name: 'Formation Pair A',
      description: 'Formation pair member A, closely spaced with TGT-4b (0.05 deg).',
      startTime: 120,
      waypoints: [
        { time: 0, position: { lat: 32.2, lon: 34.4, alt: 5000 }, velocity: { vx: 30, vy: -100, vz: 0 } },
        { time: 390, position: { lat: 31.85, lon: 34.52, alt: 5000 } },
        { time: 780, position: { lat: 31.5, lon: 34.64, alt: 5000 } },
      ],
    },
    // TGT-4b: Formation pair B (0.05° offset from 4a)
    {
      targetId: 'TGT-4b',
      name: 'Formation Pair B',
      description: 'Formation pair member B, closely spaced with TGT-4a (0.05 deg).',
      startTime: 120,
      waypoints: [
        { time: 0, position: { lat: 32.25, lon: 34.4, alt: 5000 }, velocity: { vx: 30, vy: -100, vz: 0 } },
        { time: 390, position: { lat: 31.9, lon: 34.52, alt: 5000 } },
        { time: 780, position: { lat: 31.55, lon: 34.64, alt: 5000 } },
      ],
    },
    // TGT-5: Low slow along baseline (alt 500 m, W to E)
    {
      targetId: 'TGT-5',
      name: 'Low Slow Along Baseline',
      description: 'Low-altitude slow target flying W→E along the EO baseline at 500 m.',
      startTime: 180,
      waypoints: [
        { time: 0, position: { lat: 31.15, lon: 34.2, alt: 500 }, velocity: { vx: 60, vy: 0, vz: 0 } },
        { time: 360, position: { lat: 31.15, lon: 34.5, alt: 500 } },
        { time: 720, position: { lat: 31.15, lon: 34.8, alt: 500 } },
      ],
    },
    // TGT-6: Crosses perpendicular through sensor triangle (N to S)
    {
      targetId: 'TGT-6',
      name: 'Perpendicular Crosser',
      description: 'Crosses N→S through the sensor triangle at 7 000 m.',
      startTime: 240,
      waypoints: [
        { time: 0, position: { lat: 32.0, lon: 34.5, alt: 7000 }, velocity: { vx: 0, vy: -120, vz: 0 } },
        { time: 330, position: { lat: 31.5, lon: 34.5, alt: 7000 } },
        { time: 660, position: { lat: 31.0, lon: 34.5, alt: 7000 } },
      ],
    },
    // TGT-7: Enters EO-1 FOV same time as TGT-2 (from E)
    {
      targetId: 'TGT-7',
      name: 'Eastern Intruder',
      description: 'Approaches from the east, enters EO-1 FOV at the same time as TGT-2.',
      startTime: 300,
      waypoints: [
        { time: 0, position: { lat: 31.0, lon: 35.3, alt: 6000 }, velocity: { vx: -100, vy: 0, vz: 0 } },
        { time: 300, position: { lat: 31.0, lon: 34.9, alt: 6000 } },
        { time: 600, position: { lat: 31.0, lon: 34.5, alt: 6000 } },
      ],
    },
  ],

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-2',
      startTime: 400,
      magnitude: 2, // +2 degrees
    },
    {
      type: 'clock_drift',
      sensorId: 'EO-3',
      startTime: 500,
      magnitude: 100, // 100 ms
    },
    {
      type: 'sensor_outage',
      sensorId: 'RADAR-1',
      startTime: 600,
      endTime: 630,
    },
  ],

  // ── Operator Actions ─────────────────────────────────────────────────
  operatorActions: [
    {
      type: 'reserve_sensor',
      time: 200,
      sensorId: 'EO-2',
      targetId: 'TGT-3',
    },
    {
      type: 'veto_assignment',
      time: 450,
    },
  ],
};
