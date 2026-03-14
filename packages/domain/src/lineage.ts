import type { SystemTrackId, Timestamp } from './common-types.js';
import type { TrackLineageEntry } from './system-track.js';

// Re-export TrackLineageEntry so consumers can import from lineage.ts
export type { TrackLineageEntry } from './system-track.js';

// ---------------------------------------------------------------------------
// Lineage chain
// ---------------------------------------------------------------------------

/** An ordered list of lineage entries representing a track's full history. */
export type LineageChain = TrackLineageEntry[];

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Creates a new lineage entry with the current timestamp.
 *
 * @param event      - The domain event name that caused this lineage entry.
 * @param description - Human-readable description of what happened.
 * @param parentTrackIds - IDs of parent tracks (e.g. in a merge scenario).
 */
export function createLineageEntry(
  event: string,
  description: string,
  parentTrackIds: SystemTrackId[] = [],
): TrackLineageEntry {
  return {
    version: 1,
    event,
    timestamp: Date.now() as Timestamp,
    parentTrackIds,
    description,
  };
}
