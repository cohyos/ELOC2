import type { SystemTrack, Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// RAP snapshot type
// ---------------------------------------------------------------------------

export interface RapSnapshot {
  tracks: SystemTrack[];
  timestamp: Timestamp;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
}

// ---------------------------------------------------------------------------
// buildRapSnapshot
// ---------------------------------------------------------------------------

/**
 * Build a Recognised Air Picture snapshot from the current set of system tracks.
 *
 * - Filters out dropped tracks
 * - Sorts remaining tracks by confidence descending
 * - Counts confirmed vs tentative tracks
 */
export function buildRapSnapshot(tracks: SystemTrack[]): RapSnapshot {
  const activeTracks = tracks
    .filter((t) => t.status !== 'dropped')
    .sort((a, b) => b.confidence - a.confidence);

  const confirmedCount = activeTracks.filter((t) => t.status === 'confirmed').length;
  const tentativeCount = activeTracks.filter((t) => t.status === 'tentative').length;

  return {
    tracks: activeTracks,
    timestamp: Date.now() as Timestamp,
    trackCount: activeTracks.length,
    confirmedCount,
    tentativeCount,
  };
}
