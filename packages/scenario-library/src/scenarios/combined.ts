import type { ScenarioDefinition } from '../types.js';

/**
 * Combined Threat Scenario
 *
 * Combines a Grad rocket barrage (from the north, at T+30s) with
 * a UAV drone swarm (from the east, starting at T+0s).
 *
 * Tests: multi-threat-type handling, sensor resource allocation across
 * heterogeneous targets, simultaneous fast/slow target tracking, and
 * system behavior under combined load.
 *
 * Duration: 300 seconds.
 * Sensors: 3 radars, 4 EO sensors (mix of coverage).
 */
export const combined: ScenarioDefinition = {
  id: 'combined',
  name: 'Combined Threat',
  description:
    'Grad rocket barrage (10 rockets from north at T+30s) combined with a UAV ' +
    'drone swarm (4 drones from east at T+0s). Tests multi-threat-type handling, ' +
    'sensor resource allocation, and simultaneous fast/slow target tracking.',
  durationSec: 300,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    // Long-range radar for rocket detection
    {
      sensorId: 'RADAR-CB1',
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
    // Medium-range radar for drone detection
    {
      sensorId: 'RADAR-CB2',
      type: 'radar',
      position: { lat: 31.6, lon: 35.1, alt: 50 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 120_000,
      },
    },
    // Short-range radar for close-in tracking
    {
      sensorId: 'RADAR-CB3',
      type: 'radar',
      position: { lat: 31.4, lon: 34.6, alt: 40 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 80_000,
      },
    },
    // EO sensors spread for triangulation coverage
    {
      sensorId: 'EO-CB1',
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
      sensorId: 'EO-CB2',
      type: 'eo',
      position: { lat: 31.3, lon: 34.6, alt: 45 },
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
      sensorId: 'EO-CB3',
      type: 'eo',
      position: { lat: 31.7, lon: 35.0, alt: 40 },
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
      sensorId: 'EO-CB4',
      type: 'eo',
      position: { lat: 31.6, lon: 34.5, alt: 55 },
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
  targets: [
    // ── Drone swarm from the east (t=0) ──
    // 4 drones in loose diamond, heading west at 30 m/s
    {
      targetId: 'TGT-CB-D1',
      name: 'Swarm Lead',
      description: 'Lead drone of eastern swarm. Heading west at 30 m/s, 1500 m altitude.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.6, lon: 35.4, alt: 1500 }, velocity: { vx: -30, vy: 0, vz: 0 } },
        { time: 150, position: { lat: 31.6, lon: 35.15, alt: 1500 } },
        { time: 300, position: { lat: 31.6, lon: 34.90, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-CB-D2',
      name: 'Swarm Left',
      description: 'Left-flank drone. Follows lead with ~200 m offset.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.602, lon: 35.402, alt: 1500 }, velocity: { vx: -30, vy: 0, vz: 0 } },
        { time: 150, position: { lat: 31.602, lon: 35.152, alt: 1500 } },
        { time: 300, position: { lat: 31.602, lon: 34.902, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-CB-D3',
      name: 'Swarm Right',
      description: 'Right-flank drone. Follows lead with ~200 m offset.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.598, lon: 35.402, alt: 1500 }, velocity: { vx: -30, vy: 0, vz: 0 } },
        { time: 150, position: { lat: 31.598, lon: 35.152, alt: 1500 } },
        { time: 300, position: { lat: 31.598, lon: 34.902, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-CB-D4',
      name: 'Swarm Trail',
      description: 'Trail drone. ~200 m behind lead.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.6, lon: 35.404, alt: 1500 }, velocity: { vx: -30, vy: 0, vz: 0 } },
        { time: 150, position: { lat: 31.6, lon: 35.154, alt: 1500 } },
        { time: 300, position: { lat: 31.6, lon: 34.904, alt: 1500 } },
      ],
    },

    // ── Grad barrage from the north (t=30) ──
    // 10 rockets, ~700 m/s, 60s flight, impact area around (31.5, 34.8)
    ...Array.from({ length: 10 }, (_, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const impactLat = 31.5 + (row - 0.5) * 0.0045;
      const impactLon = 34.8 + (col - 2) * 0.0045;
      const launchLat = 31.86 + (row - 0.5) * 0.0005;
      const launchLon = 34.8 + (col - 2) * 0.0005;

      return {
        targetId: `TGT-CB-R${i + 1}`,
        name: `Grad Rocket ${i + 1}`,
        description: `Rocket ${i + 1} of 10 in northern barrage.`,
        classification: 'rocket' as const,
        startTime: 30,
        waypoints: [
          { time: 0, position: { lat: launchLat, lon: launchLon, alt: 200 }, velocity: { vx: 0, vy: -700, vz: 400 } },
          { time: 15, position: { lat: (launchLat + impactLat) / 2 + 0.05, lon: (launchLon + impactLon) / 2, alt: 6000 } },
          { time: 40, position: { lat: impactLat + 0.03, lon: impactLon, alt: 3000 } },
          { time: 60, position: { lat: impactLat, lon: impactLon, alt: 50 } },
        ],
      };
    }),
  ],

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'sensor_outage',
      sensorId: 'RADAR-CB3',
      startTime: 35,
      endTime: 50, // dropout during rocket barrage — tests graceful degradation
    },
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-CB2',
      startTime: 100,
      magnitude: 2, // bias on drone-tracking radar
    },
  ],

  // ── Operator Actions ─────────────────────────────────────────────────
  operatorActions: [
    {
      type: 'reserve_sensor',
      time: 40,
      sensorId: 'EO-CB1',
      targetId: 'TGT-CB-R1', // prioritize rocket tracking
    },
  ],
};
