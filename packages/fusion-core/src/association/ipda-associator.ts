/**
 * Integrated Probabilistic Data Association (IPDA).
 *
 * Extends JPDA by also updating the track's existence probability
 * based on the association results.
 */

import type { SourceObservation, SystemTrack } from '@eloc2/domain';
import type { FusedState } from '../fusion/fuser.js';
import type { BetaCoefficients } from './jpda-associator.js';
import { jpdaUpdate } from './jpda-updater.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IPDAConfig {
  /** Prior existence probability for new tracks. */
  priorExistenceProbability: number;
  /** Probability of detection. */
  pDetection: number;
}

export interface IPDAResult {
  fusedState: FusedState;
  newExistenceProbability: number;
}

// ---------------------------------------------------------------------------
// IPDA Update
// ---------------------------------------------------------------------------

/**
 * Perform IPDA update: JPDA weighted fusion + existence probability update.
 *
 * @param track               The track to update.
 * @param betas               Beta coefficients from JPDA.
 * @param observations        All observations in the cluster.
 * @param existenceProbability Current existence probability of the track.
 * @param config              IPDA configuration.
 * @returns Updated fused state and new existence probability.
 */
export function ipdaUpdate(
  track: SystemTrack,
  betas: BetaCoefficients,
  observations: SourceObservation[],
  existenceProbability: number,
  config: IPDAConfig,
): IPDAResult {
  // 1. Perform standard JPDA update
  const fusedState = jpdaUpdate(track, betas, observations);

  // 2. Update existence probability
  // Beta for missed detection
  const betaMiss = betas.betas.get(-1) ?? 0;

  // Total association beta (probability that at least one observation is real)
  const betaAssociated = 1 - betaMiss;

  // Likelihood ratio for existence:
  //   L = P(observations | target exists) / P(observations | target does not exist)
  // Simplified: if target exists, it was either detected or missed.
  // If detected: betaAssociated is high → evidence for existence
  // If missed: betaMiss is high → evidence against existence (but not conclusive)
  const detLikelihood = betaAssociated * config.pDetection + betaMiss * (1 - config.pDetection);
  const noDetLikelihood = betaMiss; // false alarm probability ≈ clutter

  const lr = (detLikelihood + 1e-30) / (noDetLikelihood + 1e-30);

  // Bayesian update
  const priorOdds = existenceProbability / (1 - existenceProbability + 1e-30);
  const posteriorOdds = priorOdds * lr;
  const newExistence = Math.min(0.999, Math.max(0.001, posteriorOdds / (1 + posteriorOdds)));

  return {
    fusedState,
    newExistenceProbability: newExistence,
  };
}
