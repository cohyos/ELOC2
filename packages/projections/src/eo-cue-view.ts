import type { EoCue, CueId, SensorId, SystemTrackId } from '@eloc2/domain';
import type { EoOutcome } from '@eloc2/events';

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

/** A single entry in the EO cue view. */
export interface EoCueViewEntry {
  cueId: CueId;
  systemTrackId: SystemTrackId;
  sensorId: SensorId;
  status: 'active' | 'expired' | 'completed';
  outcome?: EoOutcome;
  issuedAt: number;
  expiresAt: number;
}

/** Aggregated view of all EO cues and their outcomes. */
export interface EoCueView {
  activeCues: EoCueViewEntry[];
  recentOutcomes: EoCueViewEntry[];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds a read-model view of EO cues, classifying each as active, expired,
 * or completed based on the current time and any known outcomes.
 *
 * @param cues        - All EO cues that have been issued.
 * @param outcomes    - Map from cueId to the EO outcome for completed cues.
 * @param currentTime - The current time in milliseconds since epoch.
 * @returns An EoCueView with active cues and recent outcomes separated.
 */
export function buildEoCueView(
  cues: EoCue[],
  outcomes: Map<string, EoOutcome>,
  currentTime: number,
): EoCueView {
  const activeCues: EoCueViewEntry[] = [];
  const recentOutcomes: EoCueViewEntry[] = [];

  for (const cue of cues) {
    const outcome = outcomes.get(cue.cueId);

    let status: EoCueViewEntry['status'];
    if (outcome !== undefined) {
      status = 'completed';
    } else if (currentTime > cue.validTo) {
      status = 'expired';
    } else {
      status = 'active';
    }

    const entry: EoCueViewEntry = {
      cueId: cue.cueId,
      systemTrackId: cue.systemTrackId,
      // The cue itself does not carry a sensorId; use a placeholder.
      // In a full system the task assignment would bind cue to sensor.
      sensorId: '' as SensorId,
      status,
      outcome,
      issuedAt: cue.validFrom,
      expiresAt: cue.validTo,
    };

    if (status === 'active') {
      activeCues.push(entry);
    } else {
      recentOutcomes.push(entry);
    }
  }

  return {
    activeCues,
    recentOutcomes,
    timestamp: currentTime,
  };
}
