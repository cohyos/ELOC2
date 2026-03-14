import type { EoTrackId, GroupId } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.track.split
// ---------------------------------------------------------------------------

/** Emitted when an unresolved group is split into individual EO tracks. */
export interface EoTrackSplit extends EventEnvelope {
  eventType: 'eo.track.split';
  data: {
    parentGroupId: GroupId;
    newTrackIds: EoTrackId[];
    reason: string;
  };
}
