import type { RegistrationState } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FusionMode =
  | 'confirmation_only'
  | 'conservative_track_fusion'
  | 'centralized_measurement_fusion';

export interface FusionModeDecision {
  mode: FusionMode;
  reason: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// selectFusionMode
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate fusion mode based on sensor registration quality,
 * the sensor frame, and the current track confidence.
 *
 * Decision logic (evaluated in order):
 * 1. No registration state available       -> confirmation_only
 * 2. Registration is not fusion-safe       -> confirmation_only
 * 3. EO sensor (bearing-only, unknown cross-covariance) -> conservative_track_fusion
 * 4. Registration degraded                 -> conservative_track_fusion
 * 5. Good registration + radar             -> centralized_measurement_fusion
 */
export function selectFusionMode(
  registrationState: RegistrationState | undefined,
  sensorFrame: 'radar' | 'eo' | 'c4isr',
  trackConfidence: number,
): FusionModeDecision {
  // No registration state at all
  if (registrationState === undefined) {
    return {
      mode: 'confirmation_only',
      reason: 'No registration state available',
      confidence: trackConfidence,
    };
  }

  // Registration not safe for fusion
  if (!registrationState.fusionSafe) {
    return {
      mode: 'confirmation_only',
      reason: 'Registration is unsafe for fusion',
      confidence: trackConfidence,
    };
  }

  // EO sensor — bearing-only, cross-covariance unknown
  if (sensorFrame === 'eo') {
    return {
      mode: 'conservative_track_fusion',
      reason: 'EO sensor: bearing-only, cross-covariance unknown',
      confidence: trackConfidence,
    };
  }

  // Degraded registration quality
  if (
    registrationState.spatialQuality === 'degraded' ||
    registrationState.timingQuality === 'degraded'
  ) {
    return {
      mode: 'conservative_track_fusion',
      reason: 'Registration quality is degraded',
      confidence: trackConfidence,
    };
  }

  // Good registration + radar (or c4isr with good registration)
  return {
    mode: 'centralized_measurement_fusion',
    reason: 'Good registration quality with compatible sensor',
    confidence: trackConfidence,
  };
}
