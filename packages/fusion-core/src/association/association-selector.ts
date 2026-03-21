/**
 * Association mode selector.
 *
 * Decides which association algorithm to use for each cluster based on
 * cluster size and characteristics.
 */

import type { Cluster } from './gating-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssociationMode = 'nn' | 'jpda' | 'ipda' | 'mht';

export interface AssociationConfig {
  /** Max cluster size for JPDA (above this, use MHT or fall back to NN). */
  jpdaMaxClusterSize: number;
  /** Enable MHT for large clusters. */
  enableMHT: boolean;
  /** Enable IPDA (existence-aware JPDA). */
  enableIPDA: boolean;
  /** Existence probability threshold below which IPDA is preferred over JPDA. */
  ipdaExistenceThreshold: number;
}

export const DEFAULT_ASSOCIATION_CONFIG: AssociationConfig = {
  jpdaMaxClusterSize: 8,
  enableMHT: false,
  enableIPDA: false,
  ipdaExistenceThreshold: 0.7,
};

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/**
 * Select the association mode for a cluster.
 *
 * Rules:
 * - 1 track + 1 observation → NN (trivial case)
 * - 2–8 entities → JPDA (or IPDA if enabled and existence is uncertain)
 * - >8 entities → MHT if enabled, otherwise NN with tighter gate
 */
export function selectAssociationMode(
  cluster: Cluster,
  config: AssociationConfig = DEFAULT_ASSOCIATION_CONFIG,
  existenceUncertain: boolean = false,
): AssociationMode {
  const totalEntities = cluster.trackIndices.length + cluster.observationIndices.length;

  // Trivial case: NN
  if (cluster.trackIndices.length <= 1 && cluster.observationIndices.length <= 1) {
    return 'nn';
  }

  // Large cluster: MHT or fallback to NN
  if (totalEntities > config.jpdaMaxClusterSize) {
    return config.enableMHT ? 'mht' : 'nn';
  }

  // Medium cluster: JPDA or IPDA
  if (config.enableIPDA && existenceUncertain) {
    return 'ipda';
  }

  return 'jpda';
}
