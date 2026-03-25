import type { ScenarioDefinition } from '../types.js';
import { greenPineDefense } from './green-pine-defense.js';

/**
 * Green Pine — Per-Sortie Scenarios
 *
 * Split from the full 1-hour Green Pine scenario into individual sorties
 * so each threat phase can be run, observed, and evaluated independently.
 * All sorties share the same sensor deployment (Green Pine radar + 9 staring
 * EO + 3 investigators).
 */

// ── Shared sensor deployment (from full scenario) ─────────────────────────
const GP_SENSORS = greenPineDefense.sensors;
const GP_CENTER = greenPineDefense.center;

// ── Sortie 1: Fighter ─────────────────────────────────────────────────────
export const gpFighterSortie: ScenarioDefinition = {
  id: 'gp-sortie-fighter',
  name: 'GP Sortie 1 — Fighter',
  description:
    'Single Su-35 fighter crosses the defense area W→E at Mach 1.5, 10 km altitude. ' +
    'Tests initial detection, track formation, and handoff between radar and EO.',
  durationSec: 300,
  policyMode: 'auto_with_veto',
  center: GP_CENTER,
  seed: 42,
  sensors: GP_SENSORS,
  targets: [
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
        { time: 200, position: { lat: 31.35, lon: 34.95, alt: 10000 } },
        { time: 300, position: { lat: 31.30, lon: 35.50, alt: 10000 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [
    {
      type: 'reserve_sensor',
      time: 60,
      sensorId: 'EO-INV-1',
      targetId: 'TGT-F1',
    },
  ],
  operationalZones: greenPineDefense.operationalZones,
};

// ── Sortie 2: Shahed-136 Formation ────────────────────────────────────────
export const gpFormationSortie: ScenarioDefinition = {
  id: 'gp-sortie-formation',
  name: 'GP Sortie 2 — Shahed-136 Formation',
  description:
    '5-drone Shahed-136 V-formation heading south at 50 m/s, 300m AGL. ' +
    '~3 km spacing — both radar and EO can detect, track, and discriminate each member. ' +
    'Tests formation discrimination in both sensor modes.',
  durationSec: 350,
  policyMode: 'auto_with_veto',
  center: GP_CENTER,
  seed: 42,
  sensors: GP_SENSORS,
  targets: [
    {
      targetId: 'TGT-S136-1',
      name: 'Shahed-136 Lead',
      description: 'Lead drone of Shahed-136 formation, heading south at 50 m/s, 300m AGL.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.75, lon: 34.80, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.50, lon: 34.80, alt: 300 } },
        { time: 300, position: { lat: 31.25, lon: 34.80, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-2',
      name: 'Shahed-136 Left Wing',
      description: 'Left-wing drone, ~3 km west of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 5,
      waypoints: [
        { time: 0, position: { lat: 31.735, lon: 34.77, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.485, lon: 34.77, alt: 300 } },
        { time: 300, position: { lat: 31.235, lon: 34.77, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-3',
      name: 'Shahed-136 Right Wing',
      description: 'Right-wing drone, ~3 km east of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 5,
      waypoints: [
        { time: 0, position: { lat: 31.735, lon: 34.83, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.485, lon: 34.83, alt: 300 } },
        { time: 300, position: { lat: 31.235, lon: 34.83, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-4',
      name: 'Shahed-136 Left Trail',
      description: 'Left-trail drone, ~3 km behind and west of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 10,
      waypoints: [
        { time: 0, position: { lat: 31.72, lon: 34.755, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.47, lon: 34.755, alt: 300 } },
        { time: 300, position: { lat: 31.22, lon: 34.755, alt: 300 } },
      ],
    },
    {
      targetId: 'TGT-S136-5',
      name: 'Shahed-136 Right Trail',
      description: 'Right-trail drone, ~3 km behind and east of lead.',
      classification: 'uav',
      rcs: 0.05,
      startTime: 10,
      waypoints: [
        { time: 0, position: { lat: 31.72, lon: 34.845, alt: 300 }, velocity: { vx: 0, vy: -50, vz: 0 } },
        { time: 150, position: { lat: 31.47, lon: 34.845, alt: 300 } },
        { time: 300, position: { lat: 31.22, lon: 34.845, alt: 300 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
  operationalZones: greenPineDefense.operationalZones,
};

// ── Sortie 3: Ballistic Missile ───────────────────────────────────────────
export const gpBallisticSortie: ScenarioDefinition = {
  id: 'gp-sortie-ballistic',
  name: 'GP Sortie 3 — Ballistic Missile',
  description:
    'Fateh-110 ballistic missile launched 150 km north. Apogee ~80 km, reentry at ~1800 m/s. ' +
    'Tests BM detection, trajectory classification, and EO terminal-phase observation.',
  durationSec: 180,
  policyMode: 'auto_with_veto',
  center: GP_CENTER,
  seed: 42,
  sensors: GP_SENSORS,
  targets: [
    {
      targetId: 'TGT-BM1',
      name: 'Fateh-110 BM',
      description:
        'Ballistic missile launched 150 km north of Green Pine. ' +
        'Apogee ~80 km, reentry at ~1800 m/s.',
      classification: 'missile',
      rcs: 0.3,
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.60, lon: 34.82, alt: 5000 },
          velocity: { vx: 0, vy: -1200, vz: 800 } },
        { time: 50, position: { lat: 31.95, lon: 34.81, alt: 80000 },
          velocity: { vx: 0, vy: -800, vz: 0 } },
        { time: 100, position: { lat: 31.55, lon: 34.80, alt: 30000 },
          velocity: { vx: 0, vy: -600, vz: -1200 } },
        { time: 130, position: { lat: 31.28, lon: 34.80, alt: 200 },
          velocity: { vx: 0, vy: -200, vz: -1800 } },
      ],
    },
  ],
  faults: [],
  operatorActions: [],
  operationalZones: greenPineDefense.operationalZones,
};

// ── Sortie 4: Mixed Threats ───────────────────────────────────────────────
export const gpMixedSortie: ScenarioDefinition = {
  id: 'gp-sortie-mixed',
  name: 'GP Sortie 4 — Mixed Threats',
  description:
    'Continuous mixed threats (fighters, UAVs, helicopters, BMs, cruise missiles) ' +
    'spawning every 25-40s with up to 15 simultaneous. Includes sensor faults. ' +
    'Stress-tests saturation handling and track management.',
  durationSec: 2700, // 45 min of mixed threats
  policyMode: 'auto_with_veto',
  center: GP_CENTER,
  seed: 42,
  sensors: GP_SENSORS,
  // Re-use the random target generator from the full scenario
  // but start them at t=0 instead of t=900
  targets: greenPineDefense.targets.filter(t => t.startTime >= 900).map(t => ({
    ...t,
    startTime: t.startTime - 900,
  })),
  faults: greenPineDefense.faults
    .filter(f => f.startTime >= 900)
    .map(f => ({
      ...f,
      startTime: f.startTime - 900,
      ...(f.endTime ? { endTime: f.endTime - 900 } : {}),
    })),
  operatorActions: [],
  operationalZones: greenPineDefense.operationalZones,
};
