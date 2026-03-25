export const SCENARIO_LIBRARY_VERSION = '0.1.0';

// ── Types ──────────────────────────────────────────────────────────────────
export type {
  SensorDefinition,
  WaypointDef,
  TargetDefinition,
  FaultDefinition,
  OperatorActionDef,
  ScenarioDefinition,
  DeploymentDefinition,
  ThreatProfile,
  WeatherProfile,
} from './types.js';

// ── Composition ────────────────────────────────────────────────────────────
export { composeScenario } from './types.js';

// ── Scenarios ──────────────────────────────────────────────────────────────
export { gpFighterSortie, gpFormationSortie, gpBallisticSortie, gpMixedSortie } from './scenarios/green-pine-sorties.js';
export { greenPineDefense } from './scenarios/green-pine-defense.js';
export { centralIsrael } from './scenarios/central-israel.js';
export { fusionDemo } from './scenarios/fusion-demo.js';
export { ballistic } from './scenarios/ballistic.js';
export { gradBarrage } from './scenarios/grad-barrage.js';
export { droneSwarm } from './scenarios/drone-swarm.js';
export { combined } from './scenarios/combined.js';
export { eoStaringDefense } from './scenarios/eo-staring-defense.js';

export {
  singleTargetConfirm,
  crossedTracks,
  lowAltitudeClutter,
  oneCueTwoEo,
  goodTriangulation,
  badTriangulation,
  sensorFault,
  operatorOverride,
  simpleScenarios,
} from './scenarios/simple-scenarios.js';

// ── Deployments ───────────────────────────────────────────────────────────
export { discoverySquadron } from './deployments/discovery-squadron.js';
export { borderLine } from './deployments/border-line.js';
export { deployments, getDeploymentById } from './deployments/index.js';

// ── Threats ───────────────────────────────────────────────────────────────
export { basicAir } from './threats/basic-air.js';
export { ballisticThreat } from './threats/ballistic-threat.js';
export { droneSwarmThreat } from './threats/drone-swarm-threat.js';
export { gradBarrageThreat } from './threats/grad-barrage-threat.js';
export { threats, getThreatById } from './threats/index.js';

// ── Lookup ─────────────────────────────────────────────────────────────────
import type { ScenarioDefinition } from './types.js';
import { gpFighterSortie, gpFormationSortie, gpBallisticSortie, gpMixedSortie } from './scenarios/green-pine-sorties.js';
import { greenPineDefense } from './scenarios/green-pine-defense.js';
import { centralIsrael } from './scenarios/central-israel.js';
import { fusionDemo } from './scenarios/fusion-demo.js';
import { ballistic } from './scenarios/ballistic.js';
import { gradBarrage } from './scenarios/grad-barrage.js';
import { droneSwarm } from './scenarios/drone-swarm.js';
import { combined } from './scenarios/combined.js';
import { eoStaringDefense } from './scenarios/eo-staring-defense.js';
import { simpleScenarios } from './scenarios/simple-scenarios.js';

const allScenarios: readonly ScenarioDefinition[] = [
  // ── Green Pine per-sortie scenarios (at head for quick access) ──
  gpFighterSortie,
  gpFormationSortie,
  gpBallisticSortie,
  gpMixedSortie,
  // ── Full scenarios ──
  greenPineDefense,
  centralIsrael,
  fusionDemo,
  ballistic,
  gradBarrage,
  droneSwarm,
  combined,
  eoStaringDefense,
  ...simpleScenarios,
];

/**
 * Look up a scenario by its `id` field.
 * Returns `undefined` if no scenario matches.
 */
export function getScenarioById(id: string): ScenarioDefinition | undefined {
  return allScenarios.find((s) => s.id === id);
}

/** All available scenarios. */
export const scenarios: readonly ScenarioDefinition[] = allScenarios;
