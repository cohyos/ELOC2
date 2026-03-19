export { basicAir } from './basic-air.js';
export { ballisticThreat } from './ballistic-threat.js';
export { droneSwarmThreat } from './drone-swarm-threat.js';
export { gradBarrageThreat } from './grad-barrage-threat.js';

import type { ThreatProfile } from '../types.js';
import { basicAir } from './basic-air.js';
import { ballisticThreat } from './ballistic-threat.js';
import { droneSwarmThreat } from './drone-swarm-threat.js';
import { gradBarrageThreat } from './grad-barrage-threat.js';

/** All available threat profiles. */
export const threats: readonly ThreatProfile[] = [
  basicAir,
  ballisticThreat,
  droneSwarmThreat,
  gradBarrageThreat,
];

/**
 * Look up a threat profile by its `id` field.
 * Returns `undefined` if no threat matches.
 */
export function getThreatById(id: string): ThreatProfile | undefined {
  return threats.find((t) => t.id === id);
}
