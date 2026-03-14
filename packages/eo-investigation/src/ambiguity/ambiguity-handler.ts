import type { CueId, EoTrackId, SystemTrackId } from '@eloc2/domain';
import type { EoTrack } from '@eloc2/domain';
import { generateId } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single hypothesis about which system track an EO track belongs to. */
export interface AssociationHypothesis {
  hypothesisId: string;
  eoTrackId: EoTrackId;
  associatedSystemTrackId: SystemTrackId | undefined;
  probability: number;
  evidence: string[];
}

/** Result of assessing ambiguity across a set of EO tracks. */
export interface AmbiguityAssessment {
  type: 'clear' | 'crowded' | 'unresolved';
  hypotheses: AssociationHypothesis[];
  eoTrackIds: EoTrackId[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence threshold above which a track is considered high-confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assesses ambiguity among a set of EO tracks linked to the same parent cue.
 *
 * - 0 or 1 tracks  -> 'clear'  (no ambiguity)
 * - Multiple tracks, all high-confidence (> 0.7) -> 'crowded' (multiple confirmed)
 * - Multiple tracks, any with low confidence -> 'unresolved' (ambiguous)
 *
 * Each track receives a hypothesis with equal initial probability.
 */
export function assessAmbiguity(
  eoTracks: EoTrack[],
  parentCueId: CueId,
): AmbiguityAssessment {
  const eoTrackIds = eoTracks.map((t) => t.eoTrackId);

  // No ambiguity when 0 or 1 tracks
  if (eoTracks.length <= 1) {
    const hypotheses = eoTracks.map((t) => createHypothesis(t, 1));
    return { type: 'clear', hypotheses, eoTrackIds };
  }

  // Create equal-probability hypotheses for each track
  const equalProbability = 1 / eoTracks.length;
  const hypotheses = eoTracks.map((t) =>
    createHypothesis(t, equalProbability),
  );

  // Classify: all high-confidence -> crowded, otherwise unresolved
  const allHighConfidence = eoTracks.every(
    (t) => t.confidence > HIGH_CONFIDENCE_THRESHOLD,
  );

  return {
    type: allHighConfidence ? 'crowded' : 'unresolved',
    hypotheses,
    eoTrackIds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createHypothesis(
  track: EoTrack,
  probability: number,
): AssociationHypothesis {
  return {
    hypothesisId: generateId(),
    eoTrackId: track.eoTrackId,
    associatedSystemTrackId: track.associatedSystemTrackId,
    probability,
    evidence: [`confidence=${track.confidence}`, `status=${track.status}`],
  };
}
