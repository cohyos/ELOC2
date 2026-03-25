import type { ScenarioDefinition } from '../types.js';
import { STARING_SENSOR_PROFILE, INVESTIGATOR_SENSOR_PROFILE } from '@eloc2/geometry';

/**
 * EO Advantage Demonstration — "Why EO Beats Radar"
 *
 * This scenario is designed to highlight the fundamental advantages of
 * EO CORE (staring sensors + investigators) over traditional radar for
 * modern air defense threats. Each phase presents a threat category
 * where EO sensors provide a decisive advantage.
 *
 * Deployment: 3×360° staring sensors (optimal equilateral triangle,
 * ~21 km sides) + 2 EO investigators + 1 Green Pine radar for comparison.
 * The radar is included but intentionally disadvantaged to show the gap.
 *
 * ## Phase 1 (t=0–180s): Stealth / Low-RCS Targets
 *   - 3 Shahed-136 drones (RCS 0.01–0.05 m²) approach at 300m AGL
 *   - Radar barely detects them (Pd < 30% at this RCS)
 *   - EO detects by IR emission regardless of RCS → continuous tracking
 *   - ADVANTAGE: EO is RCS-independent
 *
 * ## Phase 2 (t=120–360s): Tight Formation Discrimination
 *   - 5 drones in tight V-formation, 200m spacing
 *   - Radar resolves them as 1–2 merged tracks (beam width ~0.5° at 30km = 260m)
 *   - EO resolves all 5 individually (0.1° angular resolution at 20km = 35m)
 *   - ADVANTAGE: EO has 5× better angular resolution in staring mode
 *
 * ## Phase 3 (t=240–480s): Low-Altitude Terrain Masking
 *   - 2 cruise missiles at 50m AGL weaving through terrain
 *   - Radar suffers ground clutter + terrain masking below ~200m
 *   - EO on 20m masts has direct line-of-sight to low targets
 *   - ADVANTAGE: EO immune to ground clutter
 *
 * ## Phase 4 (t=360–600s): Passive Detection (EMCON)
 *   - 2 fighter aircraft with ARM (Anti-Radiation Missiles) capability
 *   - If radar is emitting, it can be targeted by ARMs
 *   - EO is fully passive — zero emissions, undetectable
 *   - ADVANTAGE: EO enables EMCON operations
 *
 * ## Phase 5 (t=480–720s): Classification / Identification
 *   - Mixed wave: 1 friendly transport + 2 hostile drones at similar altitude
 *   - Radar sees 3 tracks with similar kinematics → cannot distinguish
 *   - EO investigators slew to each target → DRI identification pipeline
 *   - ADVANTAGE: EO provides visual ID (detection/recognition/identification)
 *
 * ## Phase 6 (t=600–900s): Combined Stress
 *   - All threat types active simultaneously (up to 10 targets)
 *   - Tests EO CORE capacity: bearing aggregation, triangulation, track mgmt
 *   - Radar competes but with known disadvantages at low RCS / close formation
 *   - ADVANTAGE: EO handles diverse threat mix without mode switching
 */

// ── Center position ──────────────────────────────────────────────────────
const CENTER_LAT = 31.25;
const CENTER_LON = 34.80;

// ── Optimal 3×360° staring sensor triangle ───────────────────────────────
// See Knowledge Base: EO_Staring_Sensor_Deployment_Geometry.md
const TRIANGLE_RADIUS_DEG = 0.11; // ~12.2 km center-to-vertex → ~21 km sides
const TRIANGLE_ANGLES = [90, 210, 330]; // North, SW, SE — equilateral

function makeStaringSensor(idx: number, angleDeg: number): ScenarioDefinition['sensors'][0] {
  const rad = (angleDeg * Math.PI) / 180;
  const labels = ['N', 'SW', 'SE'];
  return {
    sensorId: `STARE-${labels[idx]}`,
    type: 'eo' as const,
    position: {
      lat: CENTER_LAT + TRIANGLE_RADIUS_DEG * Math.sin(rad),
      lon: CENTER_LON + TRIANGLE_RADIUS_DEG * Math.cos(rad) / Math.cos(CENTER_LAT * Math.PI / 180),
      alt: 20, // 20m mast
    },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: -3,
      maxElDeg: 30,
      maxRangeM: 35_000,
    },
    fov: { halfAngleHDeg: 180, halfAngleVDeg: 15 },
    slewRateDegPerSec: 0,  // staring — no gimbal
    maxDetectionRangeM: 40_000,
    eoSpec: STARING_SENSOR_PROFILE.wideSpec,
  };
}

// ── Target helpers ───────────────────────────────────────────────────────

function approachFromBearing(
  bearingDeg: number,
  startDistKm: number,
  endDistKm: number,
  alt: number,
  speed: number,
  durationSec: number,
): Array<{ time: number; position: { lat: number; lon: number; alt: number } }> {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const startDist = startDistKm / 111.32; // deg approx
  const endDist = endDistKm / 111.32;
  const cosLat = Math.cos(CENTER_LAT * Math.PI / 180);

  return [
    {
      time: 0,
      position: {
        lat: CENTER_LAT + startDist * Math.cos(bearingRad),
        lon: CENTER_LON + startDist * Math.sin(bearingRad) / cosLat,
        alt,
      },
    },
    {
      time: durationSec,
      position: {
        lat: CENTER_LAT + endDist * Math.cos(bearingRad),
        lon: CENTER_LON + endDist * Math.sin(bearingRad) / cosLat,
        alt,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Scenario definition
// ═══════════════════════════════════════════════════════════════════════════

export const eoAdvantage: ScenarioDefinition = {
  id: 'eo-advantage',
  name: 'EO Advantage Demo — Why EO Beats Radar',
  description:
    'Six-phase scenario demonstrating EO CORE advantages over radar: ' +
    'low-RCS detection, formation discrimination, terrain masking immunity, ' +
    'passive EMCON, visual classification, and combined stress. ' +
    '3×360° staring sensors + 2 investigators + 1 radar (for comparison).',
  durationSec: 900,
  policyMode: 'auto_with_veto',
  center: { lat: CENTER_LAT, lon: CENTER_LON },
  seed: 42,

  // ── Sensors ──────────────────────────────────────────────────────────────
  sensors: [
    // 3×360° staring sensors — optimal equilateral triangle
    ...TRIANGLE_ANGLES.map((angle, i) => makeStaringSensor(i, angle)),

    // 2 EO investigators — near center, high slew rate for DRI identification
    {
      sensorId: 'EO-INV-1',
      type: 'eo' as const,
      position: { lat: CENTER_LAT + 0.015, lon: CENTER_LON - 0.01, alt: 20 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 60, maxRangeM: 35_000 },
      fov: { halfAngleHDeg: 5.0, halfAngleVDeg: 3.75 }, // 10° search FOV
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 35_000,
      eoSpec: INVESTIGATOR_SENSOR_PROFILE.wideSpec,
    },
    {
      sensorId: 'EO-INV-2',
      type: 'eo' as const,
      position: { lat: CENTER_LAT - 0.015, lon: CENTER_LON + 0.01, alt: 20 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 60, maxRangeM: 35_000 },
      fov: { halfAngleHDeg: 5.0, halfAngleVDeg: 3.75 }, // 10° search FOV
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 35_000,
      eoSpec: INVESTIGATOR_SENSOR_PROFILE.wideSpec,
    },

    // 1 Green Pine radar — for comparison (deliberately disadvantaged at low-RCS)
    {
      sensorId: 'GREEN-PINE',
      type: 'radar' as const,
      position: { lat: CENTER_LAT, lon: CENTER_LON, alt: 25 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 500_000,
      },
    },
  ],

  // ── Targets ──────────────────────────────────────────────────────────────
  targets: [
    // ══════════════════════════════════════════════════════════════════════
    // Phase 1 (t=0–180s): Stealth / Low-RCS — EO detects, radar struggles
    // ══════════════════════════════════════════════════════════════════════

    // Shahed-136 #1 — approaching from north, extremely low RCS
    {
      targetId: 'STEALTH-1',
      name: 'Shahed-136 Alpha',
      description: 'Phase 1: Low-RCS drone (0.01 m²) from north — radar Pd < 30%, EO detects by IR',
      classification: 'uav' as const,
      rcs: 0.01, irEmission: 150, // extremely low RCS + low IR — radar barely sees this
      startTime: 0,
      waypoints: approachFromBearing(0, 40, 5, 300, 45, 180),
    },
    // Shahed-136 #2 — from NE
    {
      targetId: 'STEALTH-2',
      name: 'Shahed-136 Beta',
      description: 'Phase 1: Low-RCS drone (0.03 m²) from NE',
      classification: 'uav' as const,
      rcs: 0.03, irEmission: 180,
      startTime: 20,
      waypoints: approachFromBearing(45, 38, 8, 250, 50, 160),
    },
    // Shahed-136 #3 — from NW
    {
      targetId: 'STEALTH-3',
      name: 'Shahed-136 Gamma',
      description: 'Phase 1: Low-RCS drone (0.05 m²) from NW',
      classification: 'uav' as const,
      rcs: 0.05, irEmission: 200,
      startTime: 40,
      waypoints: approachFromBearing(315, 42, 3, 350, 42, 180),
    },

    // ══════════════════════════════════════════════════════════════════════
    // Phase 2 (t=120–360s): Tight Formation — EO resolves, radar merges
    // ══════════════════════════════════════════════════════════════════════

    // 5 drones in tight V-formation, 200m spacing — radar beam width (~0.5°)
    // resolves them as 1-2 blobs at 30km. EO at 0.1° resolves all 5.
    ...[0, 1, 2, 3, 4].map((i): ScenarioDefinition['targets'][0] => {
      const bearingDeg = 90; // from east
      const bearingRad = (bearingDeg * Math.PI) / 180;
      const cosLat = Math.cos(CENTER_LAT * Math.PI / 180);
      const startDist = 0.35; // ~39 km
      const endDist = 0.05; // ~5.5 km

      // V-formation: lead + 2 wing pairs, 200m spacing (~0.0018 deg)
      const formationOffsets = [
        { lat: 0, lon: 0 },            // lead
        { lat: 0.001, lon: -0.001 },   // left wing 1 (~140m)
        { lat: -0.001, lon: -0.001 },  // right wing 1
        { lat: 0.002, lon: -0.002 },   // left wing 2 (~280m)
        { lat: -0.002, lon: -0.002 },  // right wing 2
      ];
      const off = formationOffsets[i];

      return {
        targetId: `FORMATION-${i + 1}`,
        name: `Drone Formation ${['Lead', 'L1', 'R1', 'L2', 'R2'][i]}`,
        description: `Phase 2: Tight V-formation drone #${i + 1}, 200m spacing — radar merges, EO resolves`,
        classification: 'uav' as const,
        rcs: 0.05, irEmission: 200,
        startTime: 120,
        waypoints: [
          {
            time: 0,
            position: {
              lat: CENTER_LAT + startDist * Math.cos(bearingRad) + off.lat,
              lon: CENTER_LON + startDist * Math.sin(bearingRad) / cosLat + off.lon,
              alt: 500,
            },
          },
          {
            time: 240,
            position: {
              lat: CENTER_LAT + endDist * Math.cos(bearingRad) + off.lat,
              lon: CENTER_LON + endDist * Math.sin(bearingRad) / cosLat + off.lon,
              alt: 500,
            },
          },
        ],
      };
    }),

    // ══════════════════════════════════════════════════════════════════════
    // Phase 3 (t=240–480s): Low-Altitude Terrain Masking
    // ══════════════════════════════════════════════════════════════════════

    // 2 cruise missiles at 50m AGL — radar ground clutter masks them,
    // EO sensors on 20m masts have clear sightlines
    {
      targetId: 'CRUISE-1',
      name: 'Cruise Missile Alpha',
      description: 'Phase 3: Cruise missile at 50m AGL from south — terrain masks radar, EO tracks',
      classification: 'uav' as const, // classified as UAV since no cruise_missile type
      rcs: 0.2, irEmission: 3_000,
      startTime: 240,
      waypoints: approachFromBearing(180, 35, 2, 50, 220, 240),
    },
    {
      targetId: 'CRUISE-2',
      name: 'Cruise Missile Beta',
      description: 'Phase 3: Cruise missile at 80m AGL from SW — terrain masks radar, EO tracks',
      classification: 'uav' as const,
      rcs: 0.15, irEmission: 2_500,
      startTime: 280,
      waypoints: approachFromBearing(200, 38, 5, 80, 240, 240),
    },

    // ══════════════════════════════════════════════════════════════════════
    // Phase 4 (t=360–600s): Passive Detection (EMCON)
    // ══════════════════════════════════════════════════════════════════════

    // 2 fighters with hypothetical ARM capability — radar emission = risk,
    // EO detects passively with zero electronic signature
    {
      targetId: 'ARM-FIGHTER-1',
      name: 'Su-35 (ARM-equipped)',
      description: 'Phase 4: Fighter with ARM capability — radar emission is a liability, EO is passive',
      classification: 'fighter_aircraft' as const,
      rcs: 4, irEmission: 18_000,
      startTime: 360,
      waypoints: [
        { time: 0, position: { lat: 31.65, lon: 34.40, alt: 12000 } },
        { time: 120, position: { lat: 31.35, lon: 34.75, alt: 11000 } },
        { time: 240, position: { lat: 31.15, lon: 35.20, alt: 12000 } },
      ],
    },
    {
      targetId: 'ARM-FIGHTER-2',
      name: 'Su-30 (ARM-equipped)',
      description: 'Phase 4: Second fighter approaching from east',
      classification: 'fighter_aircraft' as const,
      rcs: 5, irEmission: 20_000,
      startTime: 400,
      waypoints: [
        { time: 0, position: { lat: 31.30, lon: 35.40, alt: 10000 } },
        { time: 200, position: { lat: 31.25, lon: 34.60, alt: 9000 } },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // Phase 5 (t=480–720s): Classification / Identification
    // ══════════════════════════════════════════════════════════════════════

    // Mixed: 1 friendly transport + 2 hostile drones at similar altitude
    // Radar sees 3 similar tracks — EO investigator slews and classifies via DRI
    {
      targetId: 'FRIENDLY-1',
      name: 'C-130 Transport (Friendly)',
      description: 'Phase 5: Friendly transport — radar cannot distinguish from threats, EO identifies',
      classification: 'civilian_aircraft' as const,
      rcs: 40, irEmission: 12_000, // large transport
      startTime: 480,
      waypoints: [
        { time: 0, position: { lat: 31.50, lon: 34.50, alt: 6000 } },
        { time: 240, position: { lat: 31.10, lon: 35.10, alt: 6000 } },
      ],
    },
    {
      targetId: 'HOSTILE-DRONE-1',
      name: 'Mohajer-6 (Hostile)',
      description: 'Phase 5: Hostile drone at similar alt — only EO investigation can distinguish from friendly',
      classification: 'uav' as const,
      rcs: 0.3, irEmission: 500,
      startTime: 500,
      waypoints: [
        { time: 0, position: { lat: 31.45, lon: 34.55, alt: 5500 } },
        { time: 220, position: { lat: 31.15, lon: 34.95, alt: 5000 } },
      ],
    },
    {
      targetId: 'HOSTILE-DRONE-2',
      name: 'Shahed-129 (Hostile)',
      description: 'Phase 5: Second hostile drone nearby — needs EO identification',
      classification: 'uav' as const,
      rcs: 0.2, irEmission: 3_000,
      startTime: 520,
      waypoints: [
        { time: 0, position: { lat: 31.55, lon: 34.45, alt: 5800 } },
        { time: 200, position: { lat: 31.20, lon: 34.85, alt: 5200 } },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // Phase 6 (t=600–900s): Combined Stress — all threat types
    // ══════════════════════════════════════════════════════════════════════

    // Low-RCS drone wave
    {
      targetId: 'STRESS-D1',
      name: 'Stress Drone 1',
      description: 'Phase 6: Combined stress — low-RCS drone',
      classification: 'uav' as const,
      rcs: 0.02, irEmission: 150,
      startTime: 600,
      waypoints: approachFromBearing(30, 40, 5, 400, 48, 200),
    },
    {
      targetId: 'STRESS-D2',
      name: 'Stress Drone 2',
      description: 'Phase 6: Combined stress — low-RCS drone',
      classification: 'uav' as const,
      rcs: 0.03, irEmission: 180,
      startTime: 630,
      waypoints: approachFromBearing(150, 38, 8, 350, 45, 200),
    },
    // Low-altitude cruise missile
    {
      targetId: 'STRESS-CM1',
      name: 'Stress Cruise Missile',
      description: 'Phase 6: Combined stress — low-altitude cruise missile',
      classification: 'uav' as const,
      rcs: 0.15, irEmission: 2_500,
      startTime: 660,
      waypoints: approachFromBearing(270, 35, 3, 60, 250, 180),
    },
    // Fighter
    {
      targetId: 'STRESS-F1',
      name: 'Stress Fighter',
      description: 'Phase 6: Combined stress — fighter aircraft',
      classification: 'fighter_aircraft' as const,
      rcs: 6, irEmission: 15_000,
      startTime: 700,
      waypoints: [
        { time: 0, position: { lat: 31.60, lon: 34.40, alt: 9000 } },
        { time: 200, position: { lat: 31.10, lon: 35.20, alt: 8000 } },
      ],
    },
    // Helicopter
    {
      targetId: 'STRESS-H1',
      name: 'Stress Helicopter',
      description: 'Phase 6: Combined stress — helicopter',
      classification: 'helicopter' as const,
      rcs: 10, irEmission: 5_000,
      startTime: 720,
      waypoints: [
        { time: 0, position: { lat: 31.40, lon: 34.55, alt: 200 } },
        { time: 180, position: { lat: 31.20, lon: 34.90, alt: 250 } },
      ],
    },
  ],

  faults: [],
  operatorActions: [],
};
