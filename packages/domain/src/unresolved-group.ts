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
}
