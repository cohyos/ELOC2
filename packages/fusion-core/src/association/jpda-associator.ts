/**
 * Joint Probabilistic Data Association (JPDA).
 *
 * For a cluster of interacting tracks and observations, computes the
 * marginal association probabilities (beta coefficients) for each
 * (track, observation) pair.
 */

import type { SystemTrackId } from '@eloc2/domain';
import type { GatingMatrix, Cluster, GatingEntry } from './gating-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JPDAConfig {
  /** Sensor probability of detection [0, 1]. */
  pDetection: number;
  /** Spatial clutter density (false alarms per unit volume). */
  clutterDensity: number;
  /** Gate volume for normalizing clutter density. */
  gateVolume?: number;
}

/**
 * Beta coefficients for a single track.
 * Keys: observation index (string) or 'null' for no-association (missed detection).
 */
export interface BetaCoefficients {
  trackIndex: number;
  /** Map from observation index (or -1 for no association) to beta probability. */
  betas: Map<number, number>;
}

// ---------------------------------------------------------------------------
// Feasible event enumeration
// ---------------------------------------------------------------------------

/**
 * Generate all feasible joint events for a cluster.
 *
 * A feasible event assigns each observation to at most one track, and each
 * track to at most one observation. Observations may also be false alarms.
 *
 * @param cluster The cluster of interacting tracks and observations.
 * @param gatingMatrix The full gating matrix (used to check which pairs are feasible).
 * @returns Array of feasible events. Each event maps trackIndex → obsIndex | -1.
 */
function enumerateFeasibleEvents(
  cluster: Cluster,
  gatingMatrix: GatingMatrix,
): Map<number, number>[] {
  // Build adjacency: which observations can each track see?
  const trackToObs = new Map<number, number[]>();
  for (const ti of cluster.trackIndices) {
    trackToObs.set(ti, [-1]); // -1 = no association (missed detection)
  }

  for (const entry of gatingMatrix.entries) {
    if (
      cluster.trackIndices.includes(entry.trackIndex) &&
      cluster.observationIndices.includes(entry.observationIndex)
    ) {
      trackToObs.get(entry.trackIndex)!.push(entry.observationIndex);
    }
  }

  // Enumerate via backtracking
  const events: Map<number, number>[] = [];
  const trackList = cluster.trackIndices;

  function backtrack(
    depth: number,
    current: Map<number, number>,
    usedObs: Set<number>,
  ): void {
    if (depth === trackList.length) {
      events.push(new Map(current));
      return;
    }

    // Safety: cap at 5000 events to avoid combinatorial explosion
    if (events.length >= 5000) return;

    const ti = trackList[depth];
    const candidates = trackToObs.get(ti)!;

    for (const oi of candidates) {
      if (oi >= 0 && usedObs.has(oi)) continue; // observation already assigned
      current.set(ti, oi);
      if (oi >= 0) usedObs.add(oi);
      backtrack(depth + 1, current, usedObs);
      if (oi >= 0) usedObs.delete(oi);
    }
  }

  backtrack(0, new Map(), new Set());
  return events;
}

// ---------------------------------------------------------------------------
// Compute beta coefficients
// ---------------------------------------------------------------------------

/**
 * Compute JPDA beta coefficients for all tracks in a cluster.
 *
 * For each feasible joint event, compute its probability, then marginalize
 * to get per-track association probabilities.
 */
export function computeBetaCoefficients(
  cluster: Cluster,
  gatingMatrix: GatingMatrix,
  config: JPDAConfig,
): BetaCoefficients[] {
  const events = enumerateFeasibleEvents(cluster, gatingMatrix);
  if (events.length === 0) {
    // No feasible events — all tracks get missed-detection
    return cluster.trackIndices.map(ti => ({
      trackIndex: ti,
      betas: new Map([[-1, 1.0]]),
    }));
  }

  // Build lookup: (trackIndex, obsIndex) → gating entry
  const entryLookup = new Map<string, GatingEntry>();
  for (const entry of gatingMatrix.entries) {
    entryLookup.set(`${entry.trackIndex}:${entry.observationIndex}`, entry);
  }

  const gateVolume = config.gateVolume ?? 1.0;
  const lambda = config.clutterDensity * gateVolume;

  // Compute probability of each event
  const eventProbs: number[] = [];
  for (const event of events) {
    let logProb = 0;
    for (const [ti, oi] of event) {
      if (oi === -1) {
        // Missed detection for this track
        logProb += Math.log(1 - config.pDetection + 1e-30);
      } else {
        // Detection: Pd * N(innovation) / clutter_density
        const entry = entryLookup.get(`${ti}:${oi}`);
        if (!entry) {
          logProb += -100; // infeasible pair
          continue;
        }
        // Gaussian likelihood ~ exp(-0.5 * mahalanobis²)
        const logLik = -0.5 * entry.mahalanobisDistSq;
        logProb += Math.log(config.pDetection + 1e-30) + logLik - Math.log(lambda + 1e-30);
      }
    }
    eventProbs.push(logProb);
  }

  // Normalize (in log space for stability)
  const maxLogProb = Math.max(...eventProbs);
  const expProbs = eventProbs.map(lp => Math.exp(lp - maxLogProb));
  const totalProb = expProbs.reduce((s, v) => s + v, 0);
  const normalizedProbs = expProbs.map(p => p / totalProb);

  // Marginalize to get per-track betas
  const betaResults: BetaCoefficients[] = cluster.trackIndices.map(ti => ({
    trackIndex: ti,
    betas: new Map<number, number>(),
  }));

  const trackIdxMap = new Map(cluster.trackIndices.map((ti, i) => [ti, i]));

  for (let e = 0; e < events.length; e++) {
    const event = events[e];
    const prob = normalizedProbs[e];

    for (const [ti, oi] of event) {
      const betaIdx = trackIdxMap.get(ti)!;
      const betas = betaResults[betaIdx].betas;
      betas.set(oi, (betas.get(oi) ?? 0) + prob);
    }
  }

  return betaResults;
}
