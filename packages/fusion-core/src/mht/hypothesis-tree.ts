/**
 * Per-track hypothesis tree for track-oriented MHT.
 */

import type { KalmanState } from '../filters/kalman-filter.js';
import { kalmanPredict, kalmanUpdate, defaultObservationMatrix3D } from '../filters/kalman-filter.js';
import type { MotionModel } from '../filters/motion-models.js';
import { HypothesisNode } from './hypothesis-node.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatedObservation {
  observationId: string;
  measurement: number[]; // [e, n, u] in ENU
  measurementNoise: number[][]; // R matrix (3x3)
  logLikelihood: number; // from gating
}

export interface MHTConfig {
  /** Log-likelihood ratio for missed detection. */
  missedDetectionLLR: number;
  /** Maximum tree depth (N-scan pruning depth). */
  maxDepth: number;
  /** Maximum number of leaf nodes (K-best pruning). */
  maxLeaves: number;
}

export const DEFAULT_MHT_CONFIG: MHTConfig = {
  missedDetectionLLR: -2.0,
  maxDepth: 3,
  maxLeaves: 100,
};

// ---------------------------------------------------------------------------
// TrackHypothesisTree
// ---------------------------------------------------------------------------

export class TrackHypothesisTree {
  private root: HypothesisNode;
  private currentScan: number = 0;

  constructor(readonly trackId: string, initialState: KalmanState) {
    this.root = new HypothesisNode(
      trackId,
      0,
      null,
      initialState,
      0,
      null,
    );
  }

  getRoot(): HypothesisNode {
    return this.root;
  }

  /** Get all leaf nodes of the tree. */
  getLeaves(): HypothesisNode[] {
    const leaves: HypothesisNode[] = [];
    const stack = [this.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.isLeaf()) {
        leaves.push(node);
      } else {
        for (const child of node.children) {
          stack.push(child);
        }
      }
    }
    return leaves;
  }

  /** Get the leaf with the highest LLR. */
  getBestLeaf(): HypothesisNode {
    const leaves = this.getLeaves();
    let best = leaves[0];
    for (let i = 1; i < leaves.length; i++) {
      if (leaves[i].getLLR() > best.getLLR()) {
        best = leaves[i];
      }
    }
    return best;
  }

  /** Get total number of nodes in the tree. */
  getNodeCount(): number {
    let count = 0;
    const stack = [this.root];
    while (stack.length > 0) {
      count++;
      const node = stack.pop()!;
      for (const child of node.children) {
        stack.push(child);
      }
    }
    return count;
  }

  /**
   * Expand the tree with new observations for the next scan.
   *
   * For each leaf node:
   * 1. Predict the Kalman state forward
   * 2. Create child nodes for each gated observation + one for missed detection
   */
  expandWithObservations(
    gatedObservations: GatedObservation[],
    motionModel: MotionModel,
    config: MHTConfig = DEFAULT_MHT_CONFIG,
  ): void {
    this.currentScan++;
    const leaves = this.getLeaves();
    const H = defaultObservationMatrix3D();

    for (const leaf of leaves) {
      // Predict
      const predicted = kalmanPredict(leaf.kalmanState, motionModel.F, motionModel.Q);

      // Missed detection hypothesis
      const missNode = new HypothesisNode(
        this.trackId,
        this.currentScan,
        null,
        predicted,
        leaf.getLLR() + config.missedDetectionLLR,
        leaf,
      );
      leaf.addChild(missNode);

      // Detection hypotheses
      for (const obs of gatedObservations) {
        const { state: updated, logLikelihood } = kalmanUpdate(
          predicted,
          obs.measurement,
          H,
          obs.measurementNoise,
        );

        const detNode = new HypothesisNode(
          this.trackId,
          this.currentScan,
          obs.observationId,
          updated,
          leaf.getLLR() + logLikelihood,
          leaf,
        );
        leaf.addChild(detNode);
      }
    }
  }
}
