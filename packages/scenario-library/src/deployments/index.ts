export { discoverySquadron } from './discovery-squadron.js';
export { borderLine } from './border-line.js';

import type { DeploymentDefinition } from '../types.js';
import { discoverySquadron } from './discovery-squadron.js';
import { borderLine } from './border-line.js';

/** All available deployment presets. */
export const deployments: readonly DeploymentDefinition[] = [
  discoverySquadron,
  borderLine,
];

/**
 * Look up a deployment by its `id` field.
 * Returns `undefined` if no deployment matches.
 */
export function getDeploymentById(id: string): DeploymentDefinition | undefined {
  return deployments.find((d) => d.id === id);
}
