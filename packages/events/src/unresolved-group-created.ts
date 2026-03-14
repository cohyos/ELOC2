import type { UnresolvedGroup } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.group.created
// ---------------------------------------------------------------------------

/** Emitted when an unresolved group is created from ambiguous EO tracks. */
export interface UnresolvedGroupCreated extends EventEnvelope {
  eventType: 'eo.group.created';
  data: {
    group: UnresolvedGroup;
  };
}
