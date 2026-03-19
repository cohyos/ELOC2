import type { ScenarioDefinition } from '../types.js';

/**
 * UAV Diamond Formation Scenario
 *
 * 4 UAVs in diamond formation with ~200 m spacing. Formation flies
 * inbound, executes a 90-degree turn at t=120s, then splits into two
 * pairs at t=200s. Tests close-proximity track discrimination and
 * formation tracking.
 *
 * 2 radars, 4 EO sensors.
 * Duration: 300 seconds.
 */
export const droneSwarm: ScenarioDefinition = {
  id: 'drone-swarm',
  name: 'UAV Diamond Formation',
  description:
    '4 UAVs in diamond formation (~200 m spacing) fly inbound, execute 90-degree ' +
    'turn at t=120s, then split into pairs at t=200s. Tests close-proximity track ' +
    'discrimination and formation tracking. 2 radars, 4 EO sensors, 300 seconds.',
  durationSec: 300,
  policyMode: 'auto_with_veto',

  // ── Sensors ──────────────────────────────────────────────────────────
  sensors: [
    {
      sensorId: 'RADAR-DS-1',
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
      sensorId: 'RADAR-DS-2',
      type: 'radar',
      position: { lat: 31.3, lon: 35.0, alt: 40 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    {
      sensorId: 'EO-DS-1',
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
      sensorId: 'EO-DS-2',
      type: 'eo',
      position: { lat: 31.3, lon: 35.0, alt: 40 },
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
      sensorId: 'EO-DS-3',
      type: 'eo',
      position: { lat: 31.6, lon: 34.6, alt: 45 },
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
      sensorId: 'EO-DS-4',
      type: 'eo',
      position: { lat: 31.4, lon: 34.9, alt: 35 },
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
  // Diamond formation: lead, left wing, right wing, trail.
  // 200 m spacing ≈ 0.0018 degrees lat, 0.002 degrees lon.
  // Phase 1 (t=0–120s): Fly south at 30 m/s
  // Phase 2 (t=120–200s): Turn 90° east, still in formation
  // Phase 3 (t=200–300s): Split — lead+right go SE, left+trail go NE
  targets: [
    // UAV-1: Diamond lead
    {
      targetId: 'TGT-DS-1',
      name: 'Diamond Lead',
      description: 'Lead UAV in diamond formation. After split at t=200s, goes southeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        // Phase 1: Southbound
        { time: 0, position: { lat: 31.80, lon: 34.80, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        // Phase 2: Turn east at t=120s
        { time: 120, position: { lat: 31.77, lon: 34.80, alt: 1500 } },
        { time: 130, position: { lat: 31.77, lon: 34.81, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        // Eastbound in formation
        { time: 200, position: { lat: 31.77, lon: 34.87, alt: 1500 } },
        // Phase 3: Split — lead goes SE
        { time: 210, position: { lat: 31.768, lon: 34.88, alt: 1500 }, velocity: { vx: 25, vy: -15, vz: 0 } },
        { time: 300, position: { lat: 31.74, lon: 34.96, alt: 1500 } },
      ],
    },
    // UAV-2: Diamond left wing
    {
      targetId: 'TGT-DS-2',
      name: 'Diamond Left Wing',
      description: 'Left wing UAV in diamond formation. After split at t=200s, goes northeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        // Phase 1: Southbound, offset left (west)
        { time: 0, position: { lat: 31.7982, lon: 34.798, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        // Phase 2: Turn east
        { time: 120, position: { lat: 31.7682, lon: 34.798, alt: 1500 } },
        { time: 130, position: { lat: 31.7682, lon: 34.808, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        // Eastbound in formation
        { time: 200, position: { lat: 31.7682, lon: 34.868, alt: 1500 } },
        // Phase 3: Split — left goes NE
        { time: 210, position: { lat: 31.770, lon: 34.878, alt: 1500 }, velocity: { vx: 25, vy: 15, vz: 0 } },
        { time: 300, position: { lat: 31.80, lon: 34.95, alt: 1500 } },
      ],
    },
    // UAV-3: Diamond right wing
    {
      targetId: 'TGT-DS-3',
      name: 'Diamond Right Wing',
      description: 'Right wing UAV in diamond formation. After split at t=200s, goes southeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        // Phase 1: Southbound, offset right (east)
        { time: 0, position: { lat: 31.7982, lon: 34.802, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        // Phase 2: Turn east
        { time: 120, position: { lat: 31.7682, lon: 34.802, alt: 1500 } },
        { time: 130, position: { lat: 31.7682, lon: 34.812, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        // Eastbound in formation
        { time: 200, position: { lat: 31.7682, lon: 34.872, alt: 1500 } },
        // Phase 3: Split — right goes SE (with lead)
        { time: 210, position: { lat: 31.766, lon: 34.882, alt: 1500 }, velocity: { vx: 25, vy: -15, vz: 0 } },
        { time: 300, position: { lat: 31.738, lon: 34.962, alt: 1500 } },
      ],
    },
    // UAV-4: Diamond trail
    {
      targetId: 'TGT-DS-4',
      name: 'Diamond Trail',
      description: 'Trail UAV in diamond formation. After split at t=200s, goes northeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        // Phase 1: Southbound, offset behind (north)
        { time: 0, position: { lat: 31.7964, lon: 34.80, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        // Phase 2: Turn east
        { time: 120, position: { lat: 31.7664, lon: 34.80, alt: 1500 } },
        { time: 130, position: { lat: 31.7664, lon: 34.81, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        // Eastbound in formation
        { time: 200, position: { lat: 31.7664, lon: 34.87, alt: 1500 } },
        // Phase 3: Split — trail goes NE (with left)
        { time: 210, position: { lat: 31.768, lon: 34.878, alt: 1500 }, velocity: { vx: 25, vy: 15, vz: 0 } },
        { time: 300, position: { lat: 31.798, lon: 34.952, alt: 1500 } },
      ],
    },
  ],

  // ── Faults ───────────────────────────────────────────────────────────
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-DS-2',
      startTime: 150,
      endTime: 180,
      magnitude: 1.5, // subtle bias during the post-turn phase
    },
  ],

  // ── Operator Actions ─────────────────────────────────────────────────
  operatorActions: [
    {
      type: 'reserve_sensor',
      time: 130,
      sensorId: 'EO-DS-1',
      targetId: 'TGT-DS-1', // Reserve an EO for the lead UAV during the turn
    },
  ],
};
