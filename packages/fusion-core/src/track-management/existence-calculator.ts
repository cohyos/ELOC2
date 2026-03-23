import type { TrackQuality } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Bayesian existence probability updates
// ---------------------------------------------------------------------------

/**
 * Update existence probability upon a detection (hit).
 *
 *   P(exist | detect) = Pd * Pe / (Pd * Pe + Pfa * (1 - Pe))
 *
 * @param currentPe  Current existence probability [0, 1].
 * @param pd         Sensor probability of detection [0, 1].
 * @param pfa        Per-gate false-alarm probability [0, 1].
 * @returns Updated existence probability.
 */
export function updateExistenceOnDetection(
  currentPe: number,
  pd: number,
  pfa: number,
): number {
  const numerator = pd * currentPe;
  const denominator = numerator + pfa * (1 - currentPe);
  if (denominator <= 0) return currentPe;
  // Cap at 0.999 to prevent singularity at Pe=1.0 where miss decay
  // becomes ineffective: (1-pd)*1.0 / (1-pd) = 1.0 forever.
  return Math.min(0.999, Math.max(0, numerator / denominator));
}

/**
 * Update existence probability upon a missed detection.
 *
 *   P(exist | miss) = (1 - Pd) * Pe / ((1 - Pd) * Pe + (1 - Pfa) * (1 - Pe))
 *
 * @param currentPe  Current existence probability [0, 1].
 * @param pd         Sensor probability of detection [0, 1].
 * @param pfa        Per-gate false-alarm probability [0, 1].
 * @returns Updated existence probability.
 */
export function updateExistenceOnMiss(
  currentPe: number,
  pd: number,
  pfa: number = 0.01,
): number {
  const numerator = (1 - pd) * currentPe;
  const denominator = numerator + (1 - pfa) * (1 - currentPe);
  if (denominator <= 0) return currentPe;
  return Math.min(1, Math.max(0, numerator / denominator));
}

// ---------------------------------------------------------------------------
// Track quality computation
// ---------------------------------------------------------------------------

export interface TrackMetaForQuality {
  updateCount: number;
  missCount: number;
  existenceProbability: number;
  rollingSupportWindow: boolean[];
  sourceDiversity: number;
  motionModelConfidence: number;
  lastReliableUpdateAge: number;
  sectorClutterStress: number;
}

/**
 * Compute a comprehensive TrackQuality assessment from track metadata.
 */
export function computeTrackQuality(meta: TrackMetaForQuality): TrackQuality {
  const rollingSupportCount = meta.rollingSupportWindow.filter(Boolean).length;
  const windowSize = Math.max(1, meta.rollingSupportWindow.length);
  const kinematicConfidence = rollingSupportCount / windowSize;

  return {
    existenceProbability: meta.existenceProbability,
    kinematicConfidence: Math.min(1, Math.max(0, kinematicConfidence)),
    lastReliableUpdateAge: meta.lastReliableUpdateAge,
    rollingSupportCount,
    sourceDiversity: meta.sourceDiversity,
    motionModelConfidence: meta.motionModelConfidence,
    sectorClutterStress: meta.sectorClutterStress,
  };
}
