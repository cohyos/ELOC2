import type {
  CueId,
  EoTrackId,
  GroupId,
  Timestamp,
} from '@eloc2/domain';
import type { EoTrack, UnresolvedGroup } from '@eloc2/domain';
import { generateId } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of merging tracks into an unresolved group. */
export interface MergeResult {
  mergedGroup: UnresolvedGroup;
  mergedTracks: EoTrack[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates an UnresolvedGroup from EO tracks that cannot be distinguished.
 *
 * Each track's status is set to 'unresolved' and a new group is created
 * to hold them until they can be resolved via future measurements.
 *
 * @param tracks      - The EO tracks to merge into a group.
 * @param reason      - Human-readable reason for the merge.
 * @param parentCueId - The parent cue that originated these tracks.
 * @returns A MergeResult with the created group and updated tracks.
 */
export function mergeIntoGroup(
  tracks: EoTrack[],
  reason: string,
  parentCueId: CueId,
): MergeResult {
  const groupId = generateId() as GroupId;
  const now = Date.now() as Timestamp;

  // Update each track's status to 'unresolved'
  const mergedTracks: EoTrack[] = tracks.map((track) => ({
    ...track,
    status: 'unresolved' as const,
    lastUpdated: now,
  }));

  const eoTrackIds = mergedTracks.map((t) => t.eoTrackId);

  const mergedGroup: UnresolvedGroup = {
    groupId,
    eoTrackIds,
    parentCueId,
    reason,
    createdAt: now,
    status: 'active',
    resolutionEvent: undefined,
  };

  return { mergedGroup, mergedTracks };
}
