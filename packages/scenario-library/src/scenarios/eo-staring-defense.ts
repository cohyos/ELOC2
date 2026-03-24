import type { ScenarioDefinition } from '../types.js';

/**
 * EO Staring Defense — Pure EO-based air picture, no radar.
 *
 * Deployment: 15 staring WFOV EO sensors (5 stations × 3 sensors each)
 * arranged in a pentagon ~15-25 km from center, plus 4 EO investigators
 * with gimbals for close-range investigation.
 *
 * Design goals:
 *   - Maximize cross-station triangulation baselines (25-40 km)
 *   - Every point in the defense zone covered by ≥3 staring sensors
 *   - Investigators fill gaps and provide high-accuracy narrow-FOV bearings
 *   - Extended detection range via maxDetectionRangeM=55 km (cooled MWIR)
 *
 * Threat sequence (same as green-pine-defense for comparison):
 *   Phase 1 (t=0–300s):    Single fighter aircraft
 *   Phase 2 (t=300–600s):  Shahed-136 drone formation (5 drones)
 *   Phase 3 (t=600–900s):  Ballistic missile from 150 km north
 *   Phase 4 (t=900–3600s): Random mixed threats (up to 15 simultaneous)
 */

// ── Center position (same as Green Pine) ────────────────────────────────
const CENTER_LAT = 31.25;
const CENTER_LON = 34.80;

// ── 5 clusters in pentagon formation for maximum triangulation coverage ──
// Pentagon radius ~20 km from center; this gives ~24 km baselines between
// adjacent clusters and ~38 km diagonals — excellent for triangulation.
const CLUSTER_RADIUS_DEG = 0.18; // ~20 km
const MAST_SPREAD_DEG = 0.015;   // ~1.7 km between masts within cluster

const PENTAGON_ANGLES = [
  (90),                  // North
  (90 + 72),             // NW
  (90 + 144),            // SW
  (90 + 216),            // SE
  (90 + 288),            // NE
];

const CLUSTERS = PENTAGON_ANGLES.map((angleDeg, i) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    id: ['N', 'NW', 'SW', 'SE', 'NE'][i],
    lat: CENTER_LAT + CLUSTER_RADIUS_DEG * Math.sin(rad),
    lon: CENTER_LON + CLUSTER_RADIUS_DEG * Math.cos(rad) / Math.cos(CENTER_LAT * Math.PI / 180),
  };
});

// Helper: create 3 masts (each a 360° cooled MWIR staring sensor) per cluster
function makeStaringSensors(
  clusterId: string,
  centerLat: number,
  centerLon: number,
): ScenarioDefinition['sensors'] {
  const masts = [
    { lat: centerLat + MAST_SPREAD_DEG, lon: centerLon, label: '1' },
    { lat: centerLat - MAST_SPREAD_DEG * 0.5, lon: centerLon - MAST_SPREAD_DEG * 0.866, label: '2' },
    { lat: centerLat - MAST_SPREAD_DEG * 0.5, lon: centerLon + MAST_SPREAD_DEG * 0.866, label: '3' },
  ];

  return masts.map(m => ({
    sensorId: `STARE-${clusterId}-${m.label}`,
    type: 'eo' as const,
    position: { lat: m.lat, lon: m.lon, alt: 20 }, // 20m mast (terrain added at runtime)
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,      // full 360° panoramic
      minElDeg: -3,
      maxElDeg: 80,        // 80° vertical — covers high-altitude BMs
      maxRangeM: 35_000,   // 35 km instrumented range
    },
    fov: { halfAngleHDeg: 180, halfAngleVDeg: 40 }, // full azimuth, 80° vertical
    slewRateDegPerSec: 0,   // staring — no gimbal
    maxDetectionRangeM: 55_000, // cooled MWIR: 55 km max detection
  }));
}

// ── 4 EO investigators with gimbals, positioned at inner ring ───────────
// These provide narrow-FOV high-accuracy bearings for triangulation refinement.
// Positioned at 4 cardinal points, ~8 km from center.
const INV_RADIUS_DEG = 0.072; // ~8 km from center
const INVESTIGATORS: ScenarioDefinition['sensors'] = [
  {
    sensorId: 'EO-INV-N',
    type: 'eo',
    position: { lat: CENTER_LAT + INV_RADIUS_DEG, lon: CENTER_LON, alt: 20 },
    coverage: {
      minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
      maxRangeM: 45_000,
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    slewRateDegPerSec: 60,
    maxDetectionRangeM: 45_000,
  },
  {
    sensorId: 'EO-INV-S',
    type: 'eo',
    position: { lat: CENTER_LAT - INV_RADIUS_DEG, lon: CENTER_LON, alt: 20 },
    coverage: {
      minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
      maxRangeM: 45_000,
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    slewRateDegPerSec: 60,
    maxDetectionRangeM: 45_000,
  },
  {
    sensorId: 'EO-INV-E',
    type: 'eo',
    position: { lat: CENTER_LAT, lon: CENTER_LON + INV_RADIUS_DEG / Math.cos(CENTER_LAT * Math.PI / 180), alt: 20 },
    coverage: {
      minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
      maxRangeM: 45_000,
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    slewRateDegPerSec: 60,
    maxDetectionRangeM: 45_000,
  },
  {
    sensorId: 'EO-INV-W',
    type: 'eo',
    position: { lat: CENTER_LAT, lon: CENTER_LON - INV_RADIUS_DEG / Math.cos(CENTER_LAT * Math.PI / 180), alt: 20 },
    coverage: {
      minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
      maxRangeM: 45_000,
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    slewRateDegPerSec: 60,
    maxDetectionRangeM: 45_000,
  },
];

// ── Phase 4: Random mixed threats (t=900–3600s) ──────────────────────────
// EO-adapted: targets start at 25-45 km (within EO detection range) and
// transit through the sensor coverage area. This reflects the EO defense
// concept where targets are detected as they enter the EO envelope.
function generateRandomTargets(): ScenarioDefinition['targets'] {
  const targets: ScenarioDefinition['targets'] = [];
  const seed = 42;
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  const types: Array<{
    name: string; cls: string; alt: [number, number]; speed: [number, number]; rcs: number;
  }> = [
    { name: 'Fighter', cls: 'fighter_aircraft', alt: [3000, 8000], speed: [200, 400], rcs: 5 },
    { name: 'Shahed-136', cls: 'uav', alt: [100, 1500], speed: [40, 55], rcs: 0.05 },
    { name: 'UAV', cls: 'uav', alt: [500, 3000], speed: [30, 80], rcs: 0.1 },
    { name: 'Helicopter', cls: 'helicopter', alt: [200, 800], speed: [50, 80], rcs: 10 },
    { name: 'BM', cls: 'missile', alt: [15000, 60000], speed: [800, 1500], rcs: 0.3 },
    { name: 'Cruise Missile', cls: 'uav', alt: [50, 500], speed: [180, 260], rcs: 0.2 },
  ];

  let currentTime = 900;
  let idx = 0;

  while (currentTime < 3400) {
    const typeIdx = Math.floor(rand() * types.length);
    const t = types[typeIdx];

    const alt = t.alt[0] + rand() * (t.alt[1] - t.alt[0]);
    const speed = t.speed[0] + rand() * (t.speed[1] - t.speed[0]);
    const duration = 120 + rand() * 120;

    const bearingRad = rand() * 2 * Math.PI;
    // EO-adapted: start well within detection envelope (15-30 km = 0.13-0.27 deg)
    // This ensures targets spend most of their flight time within multi-sensor coverage
    const startDistDeg = 0.13 + rand() * 0.14;

    const startLat = CENTER_LAT + startDistDeg * Math.cos(bearingRad);
    const startLon = CENTER_LON + startDistDeg * Math.sin(bearingRad) / Math.cos(CENTER_LAT * Math.PI / 180);

    // End near center (within sensor cluster coverage)
    const offsetLat = (rand() - 0.5) * 0.08;
    const offsetLon = (rand() - 0.5) * 0.08;
    const endLat = CENTER_LAT + offsetLat;
    const endLon = CENTER_LON + offsetLon;

    if (t.cls === 'missile') {
      // BM: launch from beyond range, but terminal phase enters EO coverage
      const launchDistDeg = 0.5 + rand() * 0.3; // 55-90 km (enters EO range on descent)
      const launchBearing = rand() * 2 * Math.PI;
      const lLat = CENTER_LAT + launchDistDeg * Math.cos(launchBearing);
      const lLon = CENTER_LON + launchDistDeg * Math.sin(launchBearing) / Math.cos(CENTER_LAT * Math.PI / 180);
      const apogee = 30000 + rand() * 40000;

      targets.push({
        targetId: `TGT-R${idx}`,
        name: `${t.name} ${idx + 1}`,
        description: `Random ${t.name} #${idx + 1}, phase 4.`,
        classification: t.cls as any,
        rcs: t.rcs,
        startTime: currentTime,
        waypoints: [
          { time: 0, position: { lat: lLat, lon: lLon, alt: 5000 }, velocity: { vx: 0, vy: -speed * 0.7, vz: speed * 0.7 } },
          { time: duration * 0.4, position: { lat: (lLat + endLat) / 2, lon: (lLon + endLon) / 2, alt: apogee } },
          { time: duration, position: { lat: endLat, lon: endLon, alt: 200 } },
        ],
      });
    } else {
      targets.push({
        targetId: `TGT-R${idx}`,
        name: `${t.name} ${idx + 1}`,
        description: `Random ${t.name} #${idx + 1}, phase 4.`,
        classification: t.cls as any,
        rcs: t.rcs,
        startTime: currentTime,
        waypoints: [
          { time: 0, position: { lat: startLat, lon: startLon, alt: alt } },
          { time: duration, position: { lat: endLat, lon: endLon, alt: alt } },
        ],
      });
    }

    idx++;
    currentTime += 25 + Math.floor(rand() * 16);
  }

  return targets;
}

export const eoStaringDefense: ScenarioDefinition = {
  id: 'eo-staring-defense',
  name: 'EO Staring Defense — Pure EO Picture',
  description:
    'Pure EO-based air defense: 15 staring WFOV sensors (5 stations × 3 masts, pentagon layout) ' +
    'plus 4 gimbal investigators. No radar. Demonstrates maximized EO triangulation picture. ' +
    'Same threat sequence as Green Pine for direct comparison.',
  durationSec: 3600,
  policyMode: 'auto_with_veto',
  center: { lat: CENTER_LAT, lon: CENTER_LON },
  seed: 42,

  // ── Sensors (19 total: 15 staring + 4 investigators, all EO) ──────────
  sensors: [
    // 15 staring 360° MWIR EO — 5 clusters × 3 masts each (pentagon)
    ...makeStaringSensors('N', CLUSTERS[0].lat, CLUSTERS[0].lon),
    ...makeStaringSensors('NW', CLUSTERS[1].lat, CLUSTERS[1].lon),
    ...makeStaringSensors('SW', CLUSTERS[2].lat, CLUSTERS[2].lon),
    ...makeStaringSensors('SE', CLUSTERS[3].lat, CLUSTERS[3].lon),
    ...makeStaringSensors('NE', CLUSTERS[4].lat, CLUSTERS[4].lon),

    // 4 EO investigators (gimbal, narrow FOV) — inner ring
    ...INVESTIGATORS,
  ],

  // ── Targets (identical to green-pine-defense) ─────────────────────────
  targets: [
    // Phase 1: Single fighter — enters EO envelope from NW, transits through
    // coverage area at 5 km altitude (well within EO detection range)
    {
      targetId: 'TGT-F1',
      name: 'Su-35 Fighter',
      description: 'Single fighter crosses the EO defense area NW→SE at 300 m/s, 5 km altitude.',
      classification: 'fighter_aircraft',
      rcs: 10,
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.55, lon: 34.55, alt: 5000 }, velocity: { vx: 200, vy: -100, vz: 0 } },
        { time: 100, position: { lat: 31.45, lon: 34.72, alt: 5000 } },
        { time: 200, position: { lat: 31.30, lon: 34.85, alt: 5000 } },
        { time: 300, position: { lat: 31.15, lon: 35.00, alt: 5000 } },
      ],
    },

    // Phase 2: Shahed-136 formation (5 drones) — wider spacing for EO resolution
    // ~3 km spacing between members — above the 2 km merge threshold for separate
    // track detection by both radar and EO core triangulation.
    // Starts within N cluster coverage at ~28 km from center, heading south.
    {
      targetId: 'TGT-S136-1',
      name: 'Shahed-136 Lead',
      description: 'Lead drone of Shahed-136 formation, heading south at 50 m/s, 500m AGL.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 300,
      waypoints: [
        { time: 0, position: { lat: 31.50, lon: 34.80, alt: 500 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.375, lon: 34.80, alt: 500 } },
        { time: 300, position: { lat: 31.25, lon: 34.80, alt: 500 } },
      ],
    },
    {
      targetId: 'TGT-S136-2',
      name: 'Shahed-136 Left Wing',
      description: 'Left-wing drone, ~3 km west of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 305,
      waypoints: [
        { time: 0, position: { lat: 31.487, lon: 34.77, alt: 500 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.362, lon: 34.77, alt: 500 } },
        { time: 300, position: { lat: 31.237, lon: 34.77, alt: 500 } },
      ],
    },
    {
      targetId: 'TGT-S136-3',
      name: 'Shahed-136 Right Wing',
      description: 'Right-wing drone, ~3 km east of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 305,
      waypoints: [
        { time: 0, position: { lat: 31.487, lon: 34.83, alt: 500 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.362, lon: 34.83, alt: 500 } },
        { time: 300, position: { lat: 31.237, lon: 34.83, alt: 500 } },
      ],
    },
    {
      targetId: 'TGT-S136-4',
      name: 'Shahed-136 Left Trail',
      description: 'Left-trail drone, ~3 km behind and west of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 310,
      waypoints: [
        { time: 0, position: { lat: 31.473, lon: 34.755, alt: 500 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.348, lon: 34.755, alt: 500 } },
        { time: 300, position: { lat: 31.223, lon: 34.755, alt: 500 } },
      ],
    },
    {
      targetId: 'TGT-S136-5',
      name: 'Shahed-136 Right Trail',
      description: 'Right-trail drone, ~3 km behind and east of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 310,
      waypoints: [
        { time: 0, position: { lat: 31.473, lon: 34.845, alt: 500 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.348, lon: 34.845, alt: 500 } },
        { time: 300, position: { lat: 31.223, lon: 34.845, alt: 500 } },
      ],
    },

    // Phase 3: Ballistic missile — EO detects terminal phase (high IR signature)
    // Starts visible from mid-course when within 55 km detection range (high altitude
    // BMs have strong IR emission detectable at extended range). The apogee phase
    // at 40+ km altitude is visible to MWIR sensors from the ground.
    {
      targetId: 'TGT-BM1',
      name: 'Fateh-110 BM',
      description: 'Ballistic missile, EO detects mid-course/terminal phase within sensor range.',
      classification: 'missile',
      rcs: 0.3,
      startTime: 600,
      waypoints: [
        // Mid-course — enters EO detection envelope at ~50 km, high altitude
        { time: 0, position: { lat: 31.70, lon: 34.81, alt: 60000 }, velocity: { vx: 0, vy: -800, vz: -200 } },
        // Descending through coverage area
        { time: 40, position: { lat: 31.50, lon: 34.80, alt: 35000 }, velocity: { vx: 0, vy: -600, vz: -800 } },
        // Terminal phase — deep in EO coverage
        { time: 80, position: { lat: 31.35, lon: 34.80, alt: 10000 }, velocity: { vx: 0, vy: -300, vz: -1200 } },
        // Impact area
        { time: 110, position: { lat: 31.26, lon: 34.80, alt: 200 }, velocity: { vx: 0, vy: -100, vz: -1800 } },
      ],
    },

    // Phase 4: Random mixed threats
    ...generateRandomTargets(),
  ],

  // ── Faults (adapted for EO-only) ──────────────────────────────────────
  faults: [
    // Staring sensor outage during phase 2 (simulates partial coverage loss)
    {
      type: 'sensor_outage',
      sensorId: 'STARE-N-1',
      startTime: 450,
      endTime: 470,
    },
    // Investigator clock drift during BM engagement
    {
      type: 'clock_drift',
      sensorId: 'EO-INV-S',
      startTime: 650,
      magnitude: 80,
    },
    // Staring sensor outage during phase 4
    {
      type: 'sensor_outage',
      sensorId: 'STARE-NW-2',
      startTime: 1500,
      endTime: 1560,
    },
    // Azimuth bias on staring sensor during dense phase
    {
      type: 'azimuth_bias',
      sensorId: 'STARE-SW-3',
      startTime: 2000,
      magnitude: 1.5,
    },
  ],

  // ── Operator Actions ───────────────────────────────────────────────────
  operatorActions: [
    // Reserve investigator for fighter during phase 1
    {
      type: 'reserve_sensor',
      time: 60,
      sensorId: 'EO-INV-N',
      targetId: 'TGT-F1',
    },
    // Reserve investigator for BM during phase 3
    {
      type: 'reserve_sensor',
      time: 610,
      sensorId: 'EO-INV-S',
      targetId: 'TGT-BM1',
    },
  ],

  // ── Operational Zones ──────────────────────────────────────────────────
  operationalZones: [
    {
      id: 'oz-north-threat',
      name: 'Northern Approach Corridor',
      zoneType: 'threat_corridor',
      polygon: [
        { lat: 32.80, lon: 34.60 },
        { lat: 32.80, lon: 35.00 },
        { lat: 31.50, lon: 34.95 },
        { lat: 31.50, lon: 34.65 },
      ],
    },
    {
      id: 'oz-defense-zone',
      name: 'EO Defense Perimeter',
      zoneType: 'engagement',
      polygon: [
        { lat: 31.55, lon: 34.50 },
        { lat: 31.55, lon: 35.10 },
        { lat: 30.95, lon: 35.10 },
        { lat: 30.95, lon: 34.50 },
      ],
    },
  ],
};
