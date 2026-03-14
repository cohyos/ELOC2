import type { BearingMeasurement } from '@eloc2/domain';
import type { IdentificationSupport } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assesses identification of a target based on bearing, image quality,
 * and optionally simulated features.
 *
 * For the demo, identification is simulated based on image quality:
 * - quality > 0.8  -> type='aircraft',         confidence=quality,        features=['wing_span', 'fuselage']
 * - quality > 0.5  -> type='unknown_aircraft',  confidence=quality*0.7,    features=['moving_object']
 * - else           -> type='unidentified',      confidence=0.2,            features=['low_quality']
 *
 * @param bearing           - The bearing measurement associated with the target.
 * @param imageQuality      - Image quality score in the range [0, 1].
 * @param simulatedFeatures - Optional override for features (for testing).
 * @returns An IdentificationSupport result.
 */
export function assessIdentification(
  bearing: BearingMeasurement,
  imageQuality: number,
  simulatedFeatures?: string[],
): IdentificationSupport {
  if (imageQuality > 0.8) {
    return {
      type: 'aircraft',
      confidence: imageQuality,
      features: simulatedFeatures ?? ['wing_span', 'fuselage'],
    };
  }

  if (imageQuality > 0.5) {
    return {
      type: 'unknown_aircraft',
      confidence: imageQuality * 0.7,
      features: simulatedFeatures ?? ['moving_object'],
    };
  }

  return {
    type: 'unidentified',
    confidence: 0.2,
    features: simulatedFeatures ?? ['low_quality'],
  };
}
