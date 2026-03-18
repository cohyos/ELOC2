import type { ScenarioDefinition } from '../types.js';

/**
 * Fusion Demo — demonstrates all fusion types in a single scenario.
 *
 * 6 sensors (2 radar, 3 EO, 1 C4ISR), 6 targets over 10 minutes.
 * Each target exercises a distinct fusion path:
 *   - Radar-Radar correlation
 *   - Radar-EO fusion + triangulation
 *   - EO-only triangulation
 *   - Formation split/merge
 *   - Late pop-up track initialization
 *
 * 1 fault injection (azimuth bias on RADAR-2 at T=200s).
 */
export const fusionDemo: ScenarioDefinition = {
  id: 'fusion-demo',
  name: 'Fusion Demo',
  description:
    'Demonstrates all fusion types: radar-radar correlation, radar-EO fusion with ' +
    'triangulation, EO-only triangulation, formation split/merge, and late pop-up ' +
    'track initialization. 6 sensors, 6 targets, 10 minutes.',
  durationSec: 600,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    // Two radars with overlapping coverage in the center
    {
      sensorId: 'RADAR-1',
      type: 'radar',
      position: { lat: 31.8, lon: 34.7, alt: 50 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    {
      sensorId: 'RADAR-2',
      type: 'radar',
      position: { lat: 32.2, lon: 35.2, alt: 40 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    // Three EO sensors forming a triangle for good triangulation baselines
    {
      sensorId: 'EO-1',
      type: 'eo',
      position: { lat: 31.7, lon: 34.8, alt: 50 },
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
      position: { lat: 32.0, lon: 35.1, alt: 45 },
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
      position: { lat: 31.8, lon: 35.3, alt: 55 },
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
    // C4ISR sensor for system-level tracks
    {
      sensorId: 'C4ISR-1',
      type: 'c4isr',
      position: { lat: 32.0, lon: 34.9, alt: 0 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 500_000,
      },
    },
  ],

  // ── Targets ──────────────────────────────────────────────────────────
  targets: [
    // Target 1 "Radar-Radar": Flies through the overlap of both radars.
    // Both radars see it — demonstrates radar-radar correlation/fusion.
    {
      targetId: 'TGT-1',
      name: 'Radar-Radar',
      description:
        'Flies through the overlap zone of both radars at 9000 m. ' +
        'Demonstrates radar-radar correlation and fusion.',
      classification: 'civilian_aircraft',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.4, lon: 35.0, alt: 9000 }, velocity: { vx: -20, vy: -120, vz: 0 } },
        { time: 300, position: { lat: 32.0, lon: 34.9, alt: 9000 } },
        { time: 600, position: { lat: 31.6, lon: 34.8, alt: 9000 } },
      ],
    },
    // Target 2 "Radar-EO-Trig": In range of RADAR-1 + EO-1 + EO-2.
    // Demonstrates radar-EO fusion plus EO triangulation.
    {
      targetId: 'TGT-2',
      name: 'Radar-EO-Trig',
      description:
        'Flies near EO-1 and EO-2 while within RADAR-1 range. ' +
        'Demonstrates radar-EO fusion with triangulation.',
      classification: 'fighter_aircraft',
      startTime: 30,
      waypoints: [
        { time: 0, position: { lat: 31.9, lon: 34.9, alt: 6000 }, velocity: { vx: 15, vy: -30, vz: 0 } },
        { time: 200, position: { lat: 31.85, lon: 34.95, alt: 6000 } },
        { time: 400, position: { lat: 31.8, lon: 35.0, alt: 6000 } },
        { time: 570, position: { lat: 31.75, lon: 35.05, alt: 6000 } },
      ],
    },
    // Target 3 "EO-Only-Trig": Only visible to the 3 EO sensors (no radar).
    // Low altitude keeps it below radar detection. Demonstrates pure EO triangulation.
    {
      targetId: 'TGT-3',
      name: 'EO-Only-Trig',
      description:
        'Low-altitude target visible only to EO sensors. ' +
        'Demonstrates EO-only triangulation with 3 bearings.',
      classification: 'small_uav',
      startTime: 60,
      waypoints: [
        { time: 0, position: { lat: 31.85, lon: 35.05, alt: 300 }, velocity: { vx: 10, vy: -15, vz: 0 } },
        { time: 270, position: { lat: 31.82, lon: 35.1, alt: 300 } },
        { time: 540, position: { lat: 31.78, lon: 35.15, alt: 300 } },
      ],
    },
    // Target 4a "Formation A": Close pair with 4b (~1.5 km separation).
    // Tests split/merge ambiguity logic.
    {
      targetId: 'TGT-4a',
      name: 'Formation A',
      description:
        'Formation pair member A, closely spaced with TGT-4b (~1.5 km). ' +
        'Tests split/merge ambiguity resolution.',
      classification: 'uav',
      startTime: 90,
      waypoints: [
        { time: 0, position: { lat: 32.3, lon: 34.9, alt: 5000 }, velocity: { vx: 0, vy: -80, vz: 0 } },
        { time: 255, position: { lat: 32.1, lon: 34.9, alt: 5000 } },
        { time: 510, position: { lat: 31.9, lon: 34.9, alt: 5000 } },
      ],
    },
    // Target 4b "Formation B": ~0.015° offset from 4a (~1.5 km).
    {
      targetId: 'TGT-4b',
      name: 'Formation B',
      description:
        'Formation pair member B, closely spaced with TGT-4a (~1.5 km). ' +
        'Tests split/merge ambiguity resolution.',
      classification: 'uav',
      startTime: 90,
      waypoints: [
        { time: 0, position: { lat: 32.315, lon: 34.9, alt: 5000 }, velocity: { vx: 0, vy: -80, vz: 0 } },
        { time: 255, position: { lat: 32.115, lon: 34.9, alt: 5000 } },
        { time: 510, position: { lat: 31.915, lon: 34.9, alt: 5000 } },
      ],
    },
    // Target 5 "Pop-up": Appears at T=300s. Tests late track initialization.
    {
      targetId: 'TGT-5',
      name: 'Pop-up',
      description:
        'Appears at T=300s from the east. Tests late track initialization ' +
        'and mid-scenario fusion integration.',
      classification: 'fighter_aircraft',
      startTime: 300,
      waypoints: [
        { time: 0, position: { lat: 32.1, lon: 35.4, alt: 7000 }, velocity: { vx: -100, vy: -40, vz: 0 } },
        { time: 150, position: { lat: 32.05, lon: 35.2, alt: 7000 } },
        { time: 300, position: { lat: 32.0, lon: 35.0, alt: 7000 } },
      ],
    },
  ],

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-2',
      startTime: 200,
      endTime: 260,
      magnitude: 3, // +3 degrees bias for 60 seconds
    },
  ],

  // ── Operator Actions (none — keep simple for demo) ──────────────────
  operatorActions: [],
};
