export const SCENARIO_LIBRARY_VERSION = '0.1.0';

// ── Types ──────────────────────────────────────────────────────────────────
export type {
  SensorDefinition,
  WaypointDef,
  TargetDefinition,
  FaultDefinition,
  OperatorActionDef,
  ScenarioDefinition,
} from './types.js';

// ── Scenarios ──────────────────────────────────────────────────────────────
export { centralIsrael } from './scenarios/central-israel.js';

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

// ── Lookup ─────────────────────────────────────────────────────────────────
import type { ScenarioDefinition } from './types.js';
import { centralIsrael } from './scenarios/central-israel.js';
import { simpleScenarios } from './scenarios/simple-scenarios.js';

const allScenarios: readonly ScenarioDefinition[] = [
  centralIsrael,
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
