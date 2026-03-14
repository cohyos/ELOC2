import type {
  BearingMeasurement,
  CueId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import type { EoOutcome, EoReportReceived } from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';
import type { TrackManager } from '@eloc2/fusion-core';

// ---------------------------------------------------------------------------
// EO report data
// ---------------------------------------------------------------------------

/** Input data required to build an EO report event. */
export interface EoReportData {
  cueId: CueId;
  sensorId: SensorId;
  outcome: EoOutcome;
  bearing?: BearingMeasurement;
  imageQuality?: number;
  targetCountEstimate?: number;
  identificationSupport?: {
    type: string;
    confidence: number;
    features: string[];
  };
  timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Report creation
// ---------------------------------------------------------------------------

/**
 * Wraps raw EO report data in a full event envelope.
 *
 * @param data - The report payload.
 * @returns A fully formed EoReportReceived event.
 */
export function createEoReport(data: EoReportData): EoReportReceived {
  const envelope = createEventEnvelope(
    'eo.report.received',
    'eo-investigation',
    'report-handler',
  );

  return {
    ...envelope,
    eventType: 'eo.report.received',
    sourceReferences: [data.cueId],
    data: {
      cueId: data.cueId,
      sensorId: data.sensorId,
      outcome: data.outcome,
      bearing: data.bearing ?? undefined,
      imageQuality: data.imageQuality ?? undefined,
      targetCountEstimate: data.targetCountEstimate ?? undefined,
      identificationSupport: data.identificationSupport ?? undefined,
      timestamp: data.timestamp,
    },
  };
}

// ---------------------------------------------------------------------------
// Report handling
// ---------------------------------------------------------------------------

/**
 * Processes an EO report by adjusting the associated system track's
 * confidence and investigation status based on the observation outcome.
 *
 * @param report       - The EO report event.
 * @param trackManager - The track manager containing the tracks.
 * @param systemTrackId - The system track ID to update (resolved from the cue).
 */
export function handleEoReport(
  report: EoReportReceived,
  trackManager: TrackManager,
  systemTrackId: string,
): void {
  const { outcome } = report.data;

  switch (outcome) {
    case 'confirmed':
      trackManager.adjustConfidence(systemTrackId, 0.15);
      trackManager.setEoInvestigationStatus(systemTrackId, 'confirmed');
      break;

    case 'refined':
      trackManager.adjustConfidence(systemTrackId, 0.1);
      trackManager.setEoInvestigationStatus(systemTrackId, 'confirmed');
      break;

    case 'no_support':
      trackManager.adjustConfidence(systemTrackId, -0.1);
      trackManager.setEoInvestigationStatus(systemTrackId, 'no_support');
      break;

    case 'split_detected':
      trackManager.setEoInvestigationStatus(
        systemTrackId,
        'split_detected',
      );
      break;
  }
}
