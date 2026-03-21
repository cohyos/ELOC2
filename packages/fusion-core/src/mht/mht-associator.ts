/**
 * MHT associator: main driver for Multi-Hypothesis Tracking.
 *
 * Manages per-track hypothesis trees and runs the full MHT pipeline
 * for each scan.
 */

import type {
  Position3D,
  SourceObservation,
  SystemTrack,
  SystemTrackId,
} from '@eloc2/domain';
import type { KalmanState } from '../filters/kalman-filter.js';
import type { MotionModel } from '../filters/motion-models.js';
import type { FusedState } from '../fusion/fuser.js';
import {
  TrackHypothesisTree,
  type GatedObservation,
  DEFAULT_MHT_CONFIG,
  type MHTConfig,
} from './hypothesis-tree.js';
import { kBestPrune, ratioTestPrune } from './tree-pruner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MHTAssociatorConfig extends MHTConfig {
  /** Probability of detection for LLR computation. */
  pDetection: number;
  /** Clutter density for LLR computation. */
  clutterDensity: number;
  /** Density for new track hypothesis. */
  newTrackDensity: number;
  /** LLR delta for ratio-test pruning. */
  deltaMax: number;
}

export const DEFAULT_MHT_ASSOCIATOR_CONFIG: MHTAssociatorConfig = {
  ...DEFAULT_MHT_CONFIG,
  pDetection: 0.9,
  clutterDensity: 1e-6,
  newTrackDensity: 1e-8,
  deltaMax: 10,
};

export interface MHTResult {
  /** Updated fused states for existing tracks. */
  trackUpdates: Map<string, FusedState>;
  /** Observations that should initiate new tracks. */
  newTrackObservations: SourceObservation[];
  /** Track IDs that should be deleted. */
  deletedTrackIds: string[];
}

// ---------------------------------------------------------------------------
// MHT Associator
// ---------------------------------------------------------------------------

/**
 * Run one scan of MHT association.
 *
 * @param tracks Active system tracks.
 * @param observations Observations for this scan.
 * @param trees Per-track hypothesis trees (maintained across scans).
 * @param motionModel Motion model for prediction.
 * @param config MHT configuration.
 * @returns MHT result with track updates, new tracks, and deletions.
 */
export function mhtAssociate(
  tracks: SystemTrack[],
  observations: SourceObservation[],
  trees: Map<string, TrackHypothesisTree>,
  motionModel: MotionModel,
  config: MHTAssociatorConfig = DEFAULT_MHT_ASSOCIATOR_CONFIG,
): MHTResult {
  const trackUpdates = new Map<string, FusedState>();
  const claimedObservations = new Set<string>();
  const deletedTrackIds: string[] = [];

  // 1. For each track, expand its hypothesis tree
  for (const track of tracks) {
    const trackId = track.systemTrackId as string;
    let tree = trees.get(trackId);

    // Initialize tree if needed
    if (!tree) {
      const initialState: KalmanState = {
        x: [0, 0, track.state.alt, 0, 0, 0], // simplified
        P: track.covariance.length === 3
          ? padCovTo6x6(track.covariance)
          : track.covariance as unknown as number[][],
      };
      tree = new TrackHypothesisTree(trackId, initialState);
      trees.set(trackId, tree);
    }

    // Convert observations to gated observations (simplified: accept all nearby)
    const gatedObs: GatedObservation[] = observations.map(obs => ({
      observationId: obs.observationId,
      measurement: [0, 0, obs.position.alt], // simplified ENU
      measurementNoise: obs.covariance.length === 3
        ? padCovTo6x6Partial(obs.covariance)
        : obs.covariance as unknown as number[][],
      logLikelihood: 0,
    }));

    // Expand tree
    tree.expandWithObservations(gatedObs, motionModel, config);

    // Prune
    kBestPrune(tree, config.maxLeaves);
    ratioTestPrune(tree, config.deltaMax);

    // Extract best hypothesis
    const bestLeaf = tree.getBestLeaf();
    if (bestLeaf.associatedObservationId) {
      claimedObservations.add(bestLeaf.associatedObservationId);

      // Convert best leaf state back to FusedState
      const state = bestLeaf.kalmanState;
      trackUpdates.set(trackId, {
        state: {
          lat: track.state.lat, // keep original lat/lon for now
          lon: track.state.lon,
          alt: state.x[2],
        },
        covariance: extractCov3x3(state.P),
        confidence: Math.min(1, Math.max(0, track.confidence + 0.05)),
        radialVelocity: track.radialVelocity,
        dopplerQuality: track.dopplerQuality,
      });
    } else {
      // Best hypothesis is missed detection — track may be degrading
      trackUpdates.set(trackId, {
        state: { ...track.state },
        covariance: track.covariance.map(r => [...r]) as number[][],
        confidence: Math.max(0, track.confidence - 0.05),
        radialVelocity: track.radialVelocity,
        dopplerQuality: track.dopplerQuality,
      });
    }
  }

  // 2. Observations not claimed by any track → candidates for new tracks
  const newTrackObservations = observations.filter(
    obs => !claimedObservations.has(obs.observationId),
  );

  return { trackUpdates, newTrackObservations, deletedTrackIds };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padCovTo6x6(cov3x3: number[][]): number[][] {
  const P = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      P[i][j] = cov3x3[i][j];
    }
  }
  // Velocity covariance: large uncertainty
  P[3][3] = 1000;
  P[4][4] = 1000;
  P[5][5] = 1000;
  return P;
}

function padCovTo6x6Partial(cov3x3: number[][]): number[][] {
  return cov3x3; // For measurement noise, only 3x3 is needed
}

function extractCov3x3(P: number[][]): number[][] {
  if (P.length <= 3) return P.map(r => [...r]);
  return [
    [P[0][0], P[0][1], P[0][2]],
    [P[1][0], P[1][1], P[1][2]],
    [P[2][0], P[2][1], P[2][2]],
  ];
}
