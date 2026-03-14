import type {
  BearingMeasurement,
  CueId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.report.received
// ---------------------------------------------------------------------------

/** Possible outcomes of an EO observation. */
export type EoOutcome = 'confirmed' | 'refined' | 'no_support' | 'split_detected';

/** Emitted when an EO sensor reports back the result of a cue investigation. */
export interface EoReportReceived extends EventEnvelope {
  eventType: 'eo.report.received';
  data: {
    cueId: CueId;
    sensorId: SensorId;
    outcome: EoOutcome;
    bearing: BearingMeasurement | undefined;
    imageQuality: number | undefined;
    targetCountEstimate: number | undefined;
    identificationSupport:
      | { type: string; confidence: number; features: string[] }
      | undefined;
    timestamp: Timestamp;
  };
}
