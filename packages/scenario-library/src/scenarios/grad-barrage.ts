import type { ScenarioDefinition } from '../types.js';

/**
 * Grad Rocket Barrage Scenario
 *
 * 10 rockets launched simultaneously from a single launch point with a
 * ~500 m spread pattern between impact points. Tests multiple simultaneous
 * track initiation and track proliferation handling.
 *
 * 1 area radar (150 km range), 3 EO sensors.
 * Duration: 60 seconds.
 */
export const gradBarrage: ScenarioDefinition = {
  id: 'grad-barrage',
  name: 'Grad Rocket Barrage',
  description:
    '10 rockets launched simultaneously from a single point, spreading toward impact ' +
    'zone with ~500 m spacing. Tests simultaneous track initiation and proliferation ' +
    'handling. 1 radar, 3 EO sensors, 60 seconds.',
  durationSec: 60,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    {
      sensorId: 'RADAR-GR-1',
      type: 'radar',
      position: { lat: 31.5, lon: 34.8, alt: 50 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    {
      sensorId: 'EO-GR-1',
      type: 'eo',
      position: { lat: 31.5, lon: 34.8, alt: 50 },
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
      sensorId: 'EO-GR-2',
      type: 'eo',
      position: { lat: 31.3, lon: 34.6, alt: 40 },
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
      sensorId: 'EO-GR-3',
      type: 'eo',
      position: { lat: 31.7, lon: 34.9, alt: 45 },
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
  // All 10 rockets launch from the same point ~40 km north, spread to
  // different impact points ~500 m apart in a grid pattern.
  // Launch lat 31.86 (~40 km north of defense point at 31.5).
  // Impact area centered around lat 31.50, lon 34.80.
  // ~700 m/s average speed, 60 second flight time.
  targets: (() => {
    const launchLat = 31.86;
    const launchLon = 34.80;
    const launchAlt = 500;
    const impactBaseLat = 31.50;
    const impactBaseLon = 34.80;

    // 500m spacing ≈ 0.0045 degrees latitude, 0.005 degrees longitude
    const offsets: Array<[number, number]> = [
      [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
    ];

    return offsets.map(([dRow, dCol], i) => ({
      targetId: `TGT-GR-${i + 1}`,
      name: `Grad Rocket ${i + 1}`,
      description: `Rocket ${i + 1} of 10 in simultaneous barrage.`,
      classification: 'unknown' as const,
      startTime: 0,
      waypoints: [
        // Launch point (all rockets originate here)
        { time: 0, position: { lat: launchLat, lon: launchLon, alt: launchAlt }, velocity: { vx: 0, vy: -700, vz: 300 } },
        // Mid-flight — rockets begin to spread, climbing
        { time: 15, position: { lat: launchLat - 0.09 + dRow * 0.001, lon: launchLon + dCol * 0.001, alt: 12000 } },
        // Apex — maximum altitude
        { time: 30, position: { lat: (launchLat + impactBaseLat) / 2 + dRow * 0.002, lon: (launchLon + impactBaseLon) / 2 + dCol * 0.002, alt: 18000 } },
        // Descent — spreading further
        { time: 45, position: { lat: impactBaseLat + 0.05 + dRow * 0.003, lon: impactBaseLon + dCol * 0.003, alt: 8000 } },
        // Impact — final spread ~500m apart
        { time: 60, position: { lat: impactBaseLat + dRow * 0.0045, lon: impactBaseLon + dCol * 0.005, alt: 200 } },
      ],
    }));
  })(),

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'clock_drift',
      sensorId: 'EO-GR-2',
      startTime: 20,
      magnitude: 80, // 80 ms drift during peak tracking load
    },
  ],

  // ── Operator Actions ─────────────────────────────────────────────────
  operatorActions: [],
};
