import type { EoTrackId, GroupId } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.group.resolved
// ---------------------------------------------------------------------------

/** Emitted when an unresolved group is fully resolved into individual tracks. */
export interface UnresolvedGroupResolved extends EventEnvelope {
  eventType: 'eo.group.resolved';
  data: {
    groupId: GroupId;
    resolvedTrackIds: EoTrackId[];
    reason: string;
  };
}
