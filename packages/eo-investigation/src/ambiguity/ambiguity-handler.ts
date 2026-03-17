import type {
  BearingMeasurement,
  CueId,
  EoTrackId,
  SystemTrackId,
} from '@eloc2/domain';
import type { EoTrack, UnresolvedGroup } from '@eloc2/domain';
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
  /** Initialized hypothesis probabilities (one per track, equal). */
  initialProbabilities?: number[];
}

/** Result of a Bayesian hypothesis update. */
export interface HypothesisUpdateResult {
  /** The updated group with new probabilities, updateCount, and status. */
  group: UnresolvedGroup;
  /** Whether a hypothesis has converged above the threshold. */
  converged: boolean;
  /** Index of the winning hypothesis (if converged). */
  winnerIndex?: number;
  /** Whether the group has been escalated for operator attention. */
  escalated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence threshold above which a track is considered high-confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/** Default convergence threshold for Bayesian hypothesis updating. */
const DEFAULT_CONVERGENCE_THRESHOLD = 0.85;

/** Default sigma for Gaussian bearing likelihood (degrees). */
const DEFAULT_BEARING_SIGMA = 1.0;

/** Number of updates after which an unconverged group is escalated. */
const ESCALATION_UPDATE_COUNT = 3;

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
    return {
      type: 'clear',
      hypotheses,
      eoTrackIds,
      initialProbabilities: eoTracks.length === 1 ? [1] : [],
    };
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
    initialProbabilities: eoTracks.map(() => equalProbability),
  };
}

/**
 * Performs a Bayesian hypothesis update on an unresolved group given a new bearing.
 *
 * For each hypothesis (EO track), computes a Gaussian likelihood based on
 * angular difference between the new bearing and the track's bearing.
 * Probabilities are updated via Bayes' rule and normalized.
 *
 * After updating:
 * - Checks convergence: if max(probability) > convergenceThreshold (default 0.85)
 *   the winning hypothesis's track is marked 'confirmed' and group status = 'resolved'.
 * - Checks escalation: if updateCount >= 3 and not converged, sets escalated = true.
 *
 * @param group      - The unresolved group with hypothesis probabilities.
 * @param newBearing - A new bearing measurement to incorporate.
 * @param eoTracks   - The EO tracks corresponding to eoTrackIds in the group (same order).
 * @param options    - Optional sigma and convergence threshold overrides.
 * @returns HypothesisUpdateResult with updated group, convergence and escalation info.
 */
export function updateHypotheses(
  group: UnresolvedGroup,
  newBearing: BearingMeasurement,
  eoTracks: EoTrack[],
  options?: { sigma?: number; convergenceThreshold?: number },
): HypothesisUpdateResult {
  const sigma = options?.sigma ?? DEFAULT_BEARING_SIGMA;
  const convergenceThreshold =
    group.convergenceThreshold ??
    options?.convergenceThreshold ??
    DEFAULT_CONVERGENCE_THRESHOLD;

  const n = eoTracks.length;

  // Get current probabilities (or initialize to equal)
  let probs =
    group.hypothesisProbabilities && group.hypothesisProbabilities.length === n
      ? [...group.hypothesisProbabilities]
      : eoTracks.map(() => 1 / n);

  // Compute likelihoods: Gaussian based on angular difference
  const likelihoods = eoTracks.map((track) => {
    const azDiff = newBearing.azimuthDeg - track.bearing.azimuthDeg;
    const elDiff = newBearing.elevationDeg - track.bearing.elevationDeg;
    const angleDiff = Math.sqrt(azDiff * azDiff + elDiff * elDiff);
    return Math.exp(-0.5 * (angleDiff / sigma) ** 2);
  });

  // Bayesian update: p_i_new = p_i * likelihood_i / sum(p_j * likelihood_j)
  const unnormalized = probs.map((p, i) => p * likelihoods[i]);
  const total = unnormalized.reduce((sum, v) => sum + v, 0);

  // Guard against zero total (all likelihoods ~0) — keep probabilities unchanged
  if (total > 0) {
    probs = unnormalized.map((v) => v / total);
  }

  const updateCount = (group.updateCount ?? 0) + 1;
  const maxProb = Math.max(...probs);
  const converged = maxProb > convergenceThreshold;
  const winnerIndex = converged ? probs.indexOf(maxProb) : undefined;

  // Escalation: not converged and enough updates
  const escalated = !converged && updateCount >= ESCALATION_UPDATE_COUNT;

  const updatedGroup: UnresolvedGroup = {
    ...group,
    hypothesisProbabilities: probs,
    updateCount,
    convergenceThreshold,
    escalated,
    status: converged ? 'resolved' : group.status,
    resolutionEvent: converged
      ? `Bayesian convergence: hypothesis ${winnerIndex} (p=${maxProb.toFixed(3)})`
      : group.resolutionEvent,
  };

  return {
    group: updatedGroup,
    converged,
    winnerIndex,
    escalated,
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
