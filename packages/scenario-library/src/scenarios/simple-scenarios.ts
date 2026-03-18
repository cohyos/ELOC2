import type { ScenarioDefinition } from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// 1. single-target-confirm
//    1 radar + 1 EO + 1 target  →  clean cue and confirm
// ────────────────────────────────────────────────────────────────────────────
export const singleTargetConfirm: ScenarioDefinition = {
  id: 'single-target-confirm',
  name: 'Single Target Confirm',
  description: 'One radar cues one EO to confirm a single inbound target.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-A',
      type: 'radar',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'EO-A',
      type: 'eo',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-SC-1',
      name: 'Single Inbound',
      description: 'Straight-line inbound from the north.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.2, lon: 34.5, alt: 7000 } },
        { time: 300, position: { lat: 31.6, lon: 34.5, alt: 7000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 2. crossed-tracks
//    2 radars + 2 targets crossing paths  →  correlation test
// ────────────────────────────────────────────────────────────────────────────
export const crossedTracks: ScenarioDefinition = {
  id: 'crossed-tracks',
  name: 'Crossed Tracks',
  description: 'Two targets cross paths between two radars to stress correlation logic.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-B1',
      type: 'radar',
      position: { lat: 31.2, lon: 34.4, alt: 30 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'RADAR-B2',
      type: 'radar',
      position: { lat: 31.8, lon: 34.6, alt: 30 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
  ],
  targets: [
    {
      targetId: 'TGT-CT-1',
      name: 'NW to SE',
      description: 'Target flying NW to SE, crossing TGT-CT-2 at mid-point.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.0, lon: 34.2, alt: 6000 } },
        { time: 150, position: { lat: 31.5, lon: 34.5, alt: 6000 } },
        { time: 300, position: { lat: 31.0, lon: 34.8, alt: 6000 } },
      ],
    },
    {
      targetId: 'TGT-CT-2',
      name: 'NE to SW',
      description: 'Target flying NE to SW, crossing TGT-CT-1 at mid-point.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.0, lon: 34.8, alt: 6000 } },
        { time: 150, position: { lat: 31.5, lon: 34.5, alt: 6000 } },
        { time: 300, position: { lat: 31.0, lon: 34.2, alt: 6000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 3. low-altitude-clutter
//    1 radar + 1 EO + 1 low target  →  low confidence detections
// ────────────────────────────────────────────────────────────────────────────
export const lowAltitudeClutter: ScenarioDefinition = {
  id: 'low-altitude-clutter',
  name: 'Low Altitude Clutter',
  description: 'A single low-altitude target producing low-confidence radar returns.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-C',
      type: 'radar',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'EO-C',
      type: 'eo',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-LC-1',
      name: 'Low Creeper',
      description: 'Low-altitude target at 200 m, slow speed — clutter-prone.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.8, lon: 34.3, alt: 200 } },
        { time: 300, position: { lat: 31.55, lon: 34.5, alt: 200 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 4. one-cue-two-eo
//    1 radar + 2 EO + 1 target  →  multi-EO split test
// ────────────────────────────────────────────────────────────────────────────
export const oneCueTwoEo: ScenarioDefinition = {
  id: 'one-cue-two-eo',
  name: 'One Cue Two EO',
  description: 'One radar cue triggers two EO sensors to track the same target.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-D',
      type: 'radar',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'EO-D1',
      type: 'eo',
      position: { lat: 31.3, lon: 34.4, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'EO-D2',
      type: 'eo',
      position: { lat: 31.7, lon: 34.6, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-OC-1',
      name: 'Multi-EO Target',
      description: 'Target positioned to be visible to both EO sensors simultaneously.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.8, lon: 34.5, alt: 5000 } },
        { time: 300, position: { lat: 31.4, lon: 34.5, alt: 5000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 5. good-triangulation
//    2 EO at ~90 deg intersection angle + 1 target  →  confirmed_3d
// ────────────────────────────────────────────────────────────────────────────
export const goodTriangulation: ScenarioDefinition = {
  id: 'good-triangulation',
  name: 'Good Triangulation',
  description: 'Two EO sensors with near-90 deg intersection angle for accurate 3D fix.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'EO-E1',
      type: 'eo',
      position: { lat: 31.3, lon: 34.3, alt: 50 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 30_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'EO-E2',
      type: 'eo',
      position: { lat: 31.3, lon: 34.6, alt: 50 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 30_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-GT-1',
      name: 'Triangulation Target',
      description: 'Target placed to create ~90 deg bearing intersection between the two EO sensors.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        // Target roughly equidistant from both EO sensors at ~90 deg intersection
        { time: 0, position: { lat: 31.5, lon: 34.45, alt: 4000 } },
        { time: 300, position: { lat: 31.45, lon: 34.45, alt: 4000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 6. bad-triangulation
//    2 EO at ~5 deg intersection angle + 1 target  →  bearing_only
// ────────────────────────────────────────────────────────────────────────────
export const badTriangulation: ScenarioDefinition = {
  id: 'bad-triangulation',
  name: 'Bad Triangulation',
  description: 'Two EO sensors with a shallow ~5 deg intersection angle — bearing only.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'EO-F1',
      type: 'eo',
      position: { lat: 31.3, lon: 34.4, alt: 50 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 30_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'EO-F2',
      type: 'eo',
      position: { lat: 31.32, lon: 34.42, alt: 50 }, // very close to EO-F1
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 30_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-BT-1',
      name: 'Shallow Angle Target',
      description: 'Target far from sensor pair, producing only ~5 deg bearing intersection.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        // Far target — nearly collinear bearings from the two closely-spaced sensors
        { time: 0, position: { lat: 31.8, lon: 34.6, alt: 5000 } },
        { time: 300, position: { lat: 31.75, lon: 34.55, alt: 5000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 7. sensor-fault
//    2 radars + azimuth bias fault  →  registration degradation test
// ────────────────────────────────────────────────────────────────────────────
export const sensorFault: ScenarioDefinition = {
  id: 'sensor-fault',
  name: 'Sensor Fault',
  description: 'Azimuth bias fault on one of two radars to test registration degradation.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-G1',
      type: 'radar',
      position: { lat: 31.3, lon: 34.4, alt: 30 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'RADAR-G2',
      type: 'radar',
      position: { lat: 31.7, lon: 34.6, alt: 30 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
  ],
  targets: [
    {
      targetId: 'TGT-SF-1',
      name: 'Fault Test Target',
      description: 'Inbound target visible to both radars during fault injection.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.0, lon: 34.5, alt: 7000 } },
        { time: 300, position: { lat: 31.5, lon: 34.5, alt: 7000 } },
      ],
    },
  ],
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-G2',
      startTime: 100,
      magnitude: 3, // +3 degrees bias
    },
  ],
  operatorActions: [],
};

// ────────────────────────────────────────────────────────────────────────────
// 8. operator-override
//    1 radar + 2 EO + 2 targets + operator veto  →  manual mode test
// ────────────────────────────────────────────────────────────────────────────
export const operatorOverride: ScenarioDefinition = {
  id: 'operator-override',
  name: 'Operator Override',
  description: 'Operator vetoes an auto-assignment, forcing manual mode test.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  sensors: [
    {
      sensorId: 'RADAR-H',
      type: 'radar',
      position: { lat: 31.5, lon: 34.5, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
    },
    {
      sensorId: 'EO-H1',
      type: 'eo',
      position: { lat: 31.4, lon: 34.4, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'EO-H2',
      type: 'eo',
      position: { lat: 31.6, lon: 34.6, alt: 40 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 25_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
    },
  ],
  targets: [
    {
      targetId: 'TGT-OO-1',
      name: 'Primary Target',
      description: 'Primary inbound — initially auto-assigned to EO-H1.',
      classification: 'unknown',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.9, lon: 34.4, alt: 6000 } },
        { time: 300, position: { lat: 31.45, lon: 34.45, alt: 6000 } },
      ],
    },
    {
      targetId: 'TGT-OO-2',
      name: 'Secondary Target',
      description: 'Secondary inbound — competes for EO resources.',
      classification: 'unknown',
      startTime: 30,
      waypoints: [
        { time: 0, position: { lat: 31.9, lon: 34.6, alt: 5500 } },
        { time: 270, position: { lat: 31.55, lon: 34.55, alt: 5500 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [
    {
      type: 'veto_assignment',
      time: 120,
      sensorId: 'EO-H1',
      targetId: 'TGT-OO-1',
    },
  ],
};

/** All simple scenarios in a single array for convenience. */
export const simpleScenarios: readonly ScenarioDefinition[] = [
  singleTargetConfirm,
  crossedTracks,
  lowAltitudeClutter,
  oneCueTwoEo,
  goodTriangulation,
  badTriangulation,
  sensorFault,
  operatorOverride,
] as const;
