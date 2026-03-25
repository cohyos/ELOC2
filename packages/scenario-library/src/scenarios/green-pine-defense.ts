import type { ScenarioDefinition } from '../types.js';

/**
 * Green Pine Air Defense — Full 1-hour engagement scenario.
 *
 * Deployment: 1 Green Pine (ELM-2080) long-range radar, 3 EO investigators,
 * 9 staring WFOV EO sensors (3 stations × 3 sensors each, 120° per sensor,
 * 360° coverage per station) arranged in a triangle ~8 km from the radar
 * for optimal triangulation geometry.
 *
 * Threat sequence:
 *   Phase 1 (t=0–300s):    Single fighter aircraft passes through the area
 *   Phase 2 (t=300–600s):  Shahed-136 drone formation (5 drones)
 *   Phase 3 (t=600–900s):  Ballistic missile from 150 km north
 *   Phase 4 (t=900–3600s): Random mixed threats (up to 15 simultaneous)
 *
 * Staring EO sensors detect targets by IR emission (maxDetectionRangeM = 40 km).
 */

// ── Green Pine center position (Negev highlands) ─────────────────────────
const GP_LAT = 31.25;
const GP_LON = 34.80;

// ── 3 clusters of 3 masts = 9 individual 360° MWIR staring sensors ──────
// Clusters spread ~20 km from Green Pine for maximal area coverage.
// Each cluster covers a different sector; overlapping 30 km detection
// circles create cross-cluster triangulation baselines of ~35 km.
// Within each cluster, 3 masts form a small triangle (~1.5 km sides)
// for local triangulation accuracy.
const CLUSTER_DIST_DEG = 0.18; // ~20 km from GP
const MAST_SPREAD_DEG = 0.013; // ~1.5 km between masts within cluster
const CLUSTERS = [
  { lat: GP_LAT + CLUSTER_DIST_DEG, lon: GP_LON, id: 'N' },                                        // North
  { lat: GP_LAT - CLUSTER_DIST_DEG * 0.5, lon: GP_LON - CLUSTER_DIST_DEG * 0.866, id: 'SW' },      // Southwest
  { lat: GP_LAT - CLUSTER_DIST_DEG * 0.5, lon: GP_LON + CLUSTER_DIST_DEG * 0.866, id: 'SE' },      // Southeast
];

// Helper: create 3 masts (each a 360° MWIR staring sensor) per cluster
function makeStaringSensors(
  clusterId: string,
  centerLat: number,
  centerLon: number,
): ScenarioDefinition['sensors'] {
  // 3 masts in small equilateral triangle within the cluster
  const masts = [
    { lat: centerLat + MAST_SPREAD_DEG, lon: centerLon, label: '1' },
    { lat: centerLat - MAST_SPREAD_DEG * 0.5, lon: centerLon - MAST_SPREAD_DEG * 0.866, label: '2' },
    { lat: centerLat - MAST_SPREAD_DEG * 0.5, lon: centerLon + MAST_SPREAD_DEG * 0.866, label: '3' },
  ];

  return masts.map(m => ({
    sensorId: `STARE-${clusterId}-${m.label}`,
    type: 'eo' as const,
    position: { lat: m.lat, lon: m.lon, alt: 15 }, // 15m mast (terrain added at runtime)
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,    // full 360° per sensor
      minElDeg: -3,
      maxElDeg: 20,      // 20° vertical MWIR FOV
      maxRangeM: 30_000,
    },
    fov: { halfAngleHDeg: 180, halfAngleVDeg: 10 }, // full azimuth, 20° vertical
    slewRateDegPerSec: 0, // staring — no gimbal
    maxDetectionRangeM: 40_000,
  }));
}

// ── Phase 4: Random mixed threats (t=900–3600s) ──────────────────────────
// Generate randomized targets so that no more than ~15 are active at a time.
// Each target lives 120–240s. We spawn a new one every ~25–40s.
function generateRandomTargets(): ScenarioDefinition['targets'] {
  const targets: ScenarioDefinition['targets'] = [];
  const seed = 42; // deterministic pseudo-random
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  const types: Array<{
    name: string; cls: string; alt: [number, number]; speed: [number, number]; rcs: number;
  }> = [
    { name: 'Fighter', cls: 'fighter_aircraft', alt: [5000, 15000], speed: [250, 500], rcs: 5 },
    { name: 'Shahed-136', cls: 'uav', alt: [100, 1500], speed: [40, 55], rcs: 0.05 },
    { name: 'UAV', cls: 'uav', alt: [500, 4000], speed: [30, 80], rcs: 0.1 },
    { name: 'Helicopter', cls: 'helicopter', alt: [200, 800], speed: [50, 80], rcs: 10 },
    { name: 'BM', cls: 'missile', alt: [25000, 120000], speed: [1000, 2200], rcs: 0.3 },
    { name: 'Cruise Missile', cls: 'uav', alt: [50, 500], speed: [200, 260], rcs: 0.2 },
  ];

  let currentTime = 900;
  let idx = 0;

  while (currentTime < 3400) {
    const typeIdx = Math.floor(rand() * types.length);
    const t = types[typeIdx];

    const alt = t.alt[0] + rand() * (t.alt[1] - t.alt[0]);
    const speed = t.speed[0] + rand() * (t.speed[1] - t.speed[0]);
    const duration = 120 + rand() * 120; // 120–240 seconds

    // Random approach bearing (0–360°)
    const bearingRad = rand() * 2 * Math.PI;
    const startDistDeg = 0.6 + rand() * 0.5; // start 60–110 km out

    const startLat = GP_LAT + startDistDeg * Math.cos(bearingRad);
    const startLon = GP_LON + startDistDeg * Math.sin(bearingRad) / Math.cos(GP_LAT * Math.PI / 180);

    // Head toward Green Pine area (with some offset)
    const offsetLat = (rand() - 0.5) * 0.15;
    const offsetLon = (rand() - 0.5) * 0.15;
    const endLat = GP_LAT + offsetLat;
    const endLon = GP_LON + offsetLon;

    // For BM: special high-altitude ballistic profile
    if (t.cls === 'ballistic_missile') {
      const launchDistDeg = 1.35; // ~150 km
      const launchBearing = rand() * 2 * Math.PI;
      const lLat = GP_LAT + launchDistDeg * Math.cos(launchBearing);
      const lLon = GP_LON + launchDistDeg * Math.sin(launchBearing) / Math.cos(GP_LAT * Math.PI / 180);
      const apogee = 40000 + rand() * 60000;

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
    // Space targets 25–40s apart to keep ≤15 active at a time
    currentTime += 25 + Math.floor(rand() * 16);
  }

  return targets;
}

export const greenPineDefense: ScenarioDefinition = {
  id: 'green-pine-defense',
  name: 'Green Pine Air Defense — 1 Hour',
  description:
    'Full 1-hour engagement: Green Pine radar + 3 EO investigators + 9 staring WFOV EO ' +
    '(3 stations × 3 sensors, 360° each). Phased threats: fighter → Shahed-136 formation → ' +
    'ballistic missile → continuous mixed threats (≤15 simultaneous).',
  durationSec: 3600,
  policyMode: 'auto_with_veto',
  center: { lat: GP_LAT, lon: GP_LON },
  seed: 42,

  // ── Sensors ──────────────────────────────────────────────────────────────
  sensors: [
    // Green Pine (ELM-2080) — long-range ballistic detection radar
    {
      sensorId: 'GREEN-PINE',
      type: 'radar',
      position: { lat: GP_LAT, lon: GP_LON, alt: 25 }, // 25m mast on hilltop
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 500_000, // 500 km — Green Pine class range
      },
    },

    // 3 EO investigators (gimbal, narrow FOV) — near the Green Pine
    {
      sensorId: 'EO-INV-1',
      type: 'eo',
      position: { lat: GP_LAT + 0.01, lon: GP_LON - 0.01, alt: 20 },
      coverage: {
        minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
        maxRangeM: 40_000,
      },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 40_000,
    },
    {
      sensorId: 'EO-INV-2',
      type: 'eo',
      position: { lat: GP_LAT - 0.01, lon: GP_LON + 0.01, alt: 20 },
      coverage: {
        minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
        maxRangeM: 40_000,
      },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 40_000,
    },
    {
      sensorId: 'EO-INV-3',
      type: 'eo',
      position: { lat: GP_LAT, lon: GP_LON + 0.015, alt: 20 },
      coverage: {
        minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90,
        maxRangeM: 40_000,
      },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 40_000,
    },

    // 9 staring 360° MWIR EO — 3 clusters × 3 masts each
    ...makeStaringSensors('N', CLUSTERS[0].lat, CLUSTERS[0].lon),
    ...makeStaringSensors('SW', CLUSTERS[1].lat, CLUSTERS[1].lon),
    ...makeStaringSensors('SE', CLUSTERS[2].lat, CLUSTERS[2].lon),
  ],

  // ── Targets ──────────────────────────────────────────────────────────────
  targets: [
    // ── Phase 1 (t=0–300s): Single fighter passes through ──
    {
      targetId: 'TGT-F1',
      name: 'Su-35 Fighter',
      description: 'Single fighter aircraft crosses the defense area W→E at Mach 1.5, 10 km altitude.',
      classification: 'fighter_aircraft',
      rcs: 10,
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.4, lon: 34.0, alt: 10000 }, velocity: { vx: 450, vy: 30, vz: 0 } },
        { time: 120, position: { lat: 31.43, lon: 34.55, alt: 10000 } },
        { time: 200, position: { lat: 31.35, lon: 34.95, alt: 10000 } }, // passes near GP
        { time: 300, position: { lat: 31.30, lon: 35.50, alt: 10000 } },
      ],
    },

    // ── Phase 2 (t=300–600s): Shahed-136 formation (5 drones) ──
    // V-formation heading south toward Green Pine from the north.
    // Tight ~300m spacing — realistic for loitering munition swarm.
    // Radar alone cannot resolve these (merge threshold 2km), but the
    // 9 staring EO sensors with 0.1° angular resolution CAN distinguish
    // individual drones at this spacing (0.1° at 25km = ~45m resolution).
    {
      targetId: 'TGT-S136-1',
      name: 'Shahed-136 Lead',
      description: 'Lead drone of Shahed-136 formation, heading south at 50 m/s, 300m AGL.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 300,
      waypoints: [
        { time: 0, position: { lat: 31.75, lon: 34.80, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.50, lon: 34.80, alt: 300 } },
        { time: 300, position: { lat: 31.25, lon: 34.80, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-2',
      name: 'Shahed-136 Left Wing',
      description: 'Left-wing drone, ~300m offset from lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 305,
      waypoints: [
        { time: 0, position: { lat: 31.749, lon: 34.797, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.499, lon: 34.797, alt: 300 } },
        { time: 300, position: { lat: 31.249, lon: 34.797, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-3',
      name: 'Shahed-136 Right Wing',
      description: 'Right-wing drone, ~300m offset from lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 305,
      waypoints: [
        { time: 0, position: { lat: 31.749, lon: 34.803, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.499, lon: 34.803, alt: 300 } },
        { time: 300, position: { lat: 31.249, lon: 34.803, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-4',
      name: 'Shahed-136 Left Trail',
      description: 'Left-trail drone, ~500m behind left wing.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 310,
      waypoints: [
        { time: 0, position: { lat: 31.747, lon: 34.795, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.497, lon: 34.795, alt: 300 } },
        { time: 300, position: { lat: 31.247, lon: 34.795, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-5',
      name: 'Shahed-136 Right Trail',
      description: 'Right-trail drone, ~500m behind right wing.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 310,
      waypoints: [
        { time: 0, position: { lat: 31.747, lon: 34.805, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.497, lon: 34.805, alt: 300 } },
        { time: 300, position: { lat: 31.247, lon: 34.805, alt: 300 } },
      ],
    },

    // ── Phase 3 (t=600–900s): Ballistic missile from 150 km north ──
    {
      targetId: 'TGT-BM1',
      name: 'Fateh-110 BM',
      description:
        'Ballistic missile launched 150 km north of Green Pine. ' +
        'Apogee ~80 km, reentry at ~1800 m/s.',
      classification: 'missile',
      rcs: 0.3,
      startTime: 600,
      waypoints: [
        // Launch phase — 150 km north, climbing
        { time: 0, position: { lat: 32.60, lon: 34.82, alt: 5000 },
          velocity: { vx: 0, vy: -1200, vz: 800 } },
        // Mid-course — apogee at ~80 km
        { time: 50, position: { lat: 31.95, lon: 34.81, alt: 80000 },
          velocity: { vx: 0, vy: -800, vz: 0 } },
        // Terminal phase — reentry
        { time: 100, position: { lat: 31.55, lon: 34.80, alt: 30000 },
          velocity: { vx: 0, vy: -600, vz: -1200 } },
        // Impact area
        { time: 130, position: { lat: 31.28, lon: 34.80, alt: 200 },
          velocity: { vx: 0, vy: -200, vz: -1800 } },
      ],
    },

    // ── Phase 4 (t=900–3600s): Random mixed threats ──
    ...generateRandomTargets(),
  ],

  // ── Faults ─────────────────────────────────────────────────────────────
  faults: [
    // Brief radar maintenance during phase 2
    {
      type: 'sensor_outage',
      sensorId: 'GREEN-PINE',
      startTime: 450,
      endTime: 470,
    },
    // EO investigator clock drift during BM engagement
    {
      type: 'clock_drift',
      sensorId: 'EO-INV-2',
      startTime: 650,
      magnitude: 80, // 80ms
    },
    // Staring sensor outage during phase 4
    {
      type: 'sensor_outage',
      sensorId: 'STARE-N-A',
      startTime: 1500,
      endTime: 1560,
    },
    // Azimuth bias on staring sensor during dense phase
    {
      type: 'azimuth_bias',
      sensorId: 'STARE-SW-B',
      startTime: 2000,
      magnitude: 1.5,
    },
  ],

  // ── Operator Actions ───────────────────────────────────────────────────
  operatorActions: [
    // Reserve EO investigator for the fighter during phase 1
    {
      type: 'reserve_sensor',
      time: 60,
      sensorId: 'EO-INV-1',
      targetId: 'TGT-F1',
    },
    // Reserve investigator for BM during phase 3
    {
      type: 'reserve_sensor',
      time: 610,
      sensorId: 'EO-INV-2',
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
      name: 'Green Pine Defense Perimeter',
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
