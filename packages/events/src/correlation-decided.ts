import type { SystemTrackId } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// correlation.decided
// ---------------------------------------------------------------------------

/** Outcome of the observation-to-track correlation step. */
export type CorrelationDecision = 'associated' | 'new_track' | 'ambiguous';

/** Emitted when the correlator decides how to handle an incoming observation. */
export interface CorrelationDecided extends EventEnvelope {
  eventType: 'correlation.decided';
  data: {
    observationId: string;
    candidateSystemTrackIds: SystemTrackId[];
    selectedTrackId: SystemTrackId | undefined;
    decision: CorrelationDecision;
    score: number;
    method: string;
    evidence: Record<string, unknown>;
  };
}
