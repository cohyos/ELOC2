import type { EoCue } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.cue.issued
// ---------------------------------------------------------------------------

/** Emitted when a new cue is sent to an EO sensor for investigation. */
export interface EoCueIssued extends EventEnvelope {
  eventType: 'eo.cue.issued';
  data: {
    cue: EoCue;
  };
}
