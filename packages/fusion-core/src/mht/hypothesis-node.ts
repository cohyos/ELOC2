/**
 * Hypothesis tree node for track-oriented MHT.
 *
 * Each node represents a possible association for a track at a specific scan.
 */

import type { KalmanState } from '../filters/kalman-filter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class HypothesisNode {
  /** Child nodes (next scan hypotheses). */
  private _children: HypothesisNode[] = [];

  constructor(
    /** Track ID this node belongs to. */
    readonly trackId: string,
    /** Scan (time step) index. */
    readonly scanIndex: number,
    /** Associated observation ID, or null for missed detection. */
    readonly associatedObservationId: string | null,
    /** Kalman state after this association. */
    readonly kalmanState: KalmanState,
    /** Cumulative log-likelihood ratio. */
    readonly logLikelihoodRatio: number,
    /** Parent node (previous scan). */
    readonly parent: HypothesisNode | null,
  ) {}

  get children(): readonly HypothesisNode[] {
    return this._children;
  }

  /** Add a child hypothesis for the next scan. */
  addChild(child: HypothesisNode): void {
    this._children.push(child);
  }

  /** Remove a child node. */
  removeChild(child: HypothesisNode): void {
    this._children = this._children.filter(c => c !== child);
  }

  /** Get the cumulative LLR of this branch. */
  getLLR(): number {
    return this.logLikelihoodRatio;
  }

  /** Get the depth of this node from the root. */
  getDepth(): number {
    let depth = 0;
    let node: HypothesisNode | null = this.parent;
    while (node) {
      depth++;
      node = node.parent;
    }
    return depth;
  }

  /** Get the chain of ancestors from root to this node. */
  getAncestorChain(): HypothesisNode[] {
    const chain: HypothesisNode[] = [this];
    let node: HypothesisNode | null = this.parent;
    while (node) {
      chain.unshift(node);
      node = node.parent;
    }
    return chain;
  }

  /** Check if this is a leaf node (no children). */
  isLeaf(): boolean {
    return this._children.length === 0;
  }
}
