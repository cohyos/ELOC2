import type { CueId, EoTrackId, GroupId, Timestamp } from './common-types.js';

// ---------------------------------------------------------------------------
// Unresolved group
// ---------------------------------------------------------------------------

/** Status of an unresolved group. */
export type UnresolvedGroupStatus = 'active' | 'resolved';

/**
 * A group of EO tracks that cannot yet be uniquely associated
 * with a single system track (e.g. because a split was detected).
 */
export interface UnresolvedGroup {
  groupId: GroupId;
  eoTrackIds: EoTrackId[];
  parentCueId: CueId;
  reason: string;
  createdAt: Timestamp;
  status: UnresolvedGroupStatus;
  resolutionEvent: string | undefined;
  /** Bayesian hypothesis probabilities (one per eoTrackId, same order). */
  hypothesisProbabilities?: number[];
  /** Number of Bayesian updates performed on this group. */
  updateCount?: number;
  /** True if updateCount >= 3 and still not converged — needs operator attention. */
  escalated?: boolean;
  /** Probability threshold for convergence (default 0.85). */
  convergenceThreshold?: number;
}
