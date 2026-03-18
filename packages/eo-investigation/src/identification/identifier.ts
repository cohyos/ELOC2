import type { BearingMeasurement, TargetClassification } from '@eloc2/domain';
import type { IdentificationSupport } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Derive realistic visual features based on a known classification. */
function deriveFeatures(classification: TargetClassification): string[] {
  switch (classification) {
    case 'fighter_aircraft':
      return ['delta_wing', 'single_engine', 'high_speed'];
    case 'passenger_aircraft':
      return ['swept_wing', 'twin_engine', 'large_fuselage'];
    case 'civilian_aircraft':
      return ['swept_wing', 'medium_fuselage'];
    case 'light_aircraft':
      return ['straight_wing', 'single_engine', 'small_fuselage'];
    case 'helicopter':
      return ['rotor_disk', 'tail_boom'];
    case 'uav':
    case 'small_uav':
    case 'drone':
      return ['small_profile', 'multi_rotor'];
    case 'bird':
    case 'birds':
      return ['organic_shape', 'wing_flapping'];
    default:
      return ['unresolved_silhouette'];
  }
}

/** Map specific classification to a broad category for low-quality identification. */
function getBroadCategory(classification: TargetClassification): string {
  if (
    ['fighter_aircraft', 'passenger_aircraft', 'civilian_aircraft', 'light_aircraft'].includes(
      classification,
    )
  )
    return 'aircraft';
  if (['uav', 'small_uav', 'drone'].includes(classification)) return 'small_air_vehicle';
  if (['bird', 'birds'].includes(classification)) return 'biological';
  if (classification === 'helicopter') return 'rotary_wing';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assesses identification of a target based on bearing, image quality,
 * and optionally simulated features.
 *
 * When a true classification is provided (from scenario ground truth), the
 * function simulates realistic EO identification with quality-dependent noise:
 * - quality > 0.6  -> correct classification with high confidence
 * - quality > 0.3  -> broad category with medium confidence
 * - else           -> falls back to generic identification
 *
 * Without ground truth, falls back to generic demo behaviour:
 * - quality > 0.8  -> type='aircraft',         confidence=quality
 * - quality > 0.5  -> type='unknown_aircraft',  confidence=quality*0.7
 * - else           -> type='unidentified',      confidence=0.2
 *
 * @param bearing             - The bearing measurement associated with the target.
 * @param imageQuality        - Image quality score in the range [0, 1].
 * @param simulatedFeatures   - Optional override for features (for testing).
 * @param trueClassification  - Optional ground-truth classification from the scenario.
 * @returns An IdentificationSupport result.
 */
export function assessIdentification(
  bearing: BearingMeasurement,
  imageQuality: number,
  simulatedFeatures?: string[],
  trueClassification?: TargetClassification,
): IdentificationSupport {
  // ── With ground truth: simulate realistic EO identification ──────────
  if (trueClassification && trueClassification !== 'unknown') {
    if (imageQuality > 0.6) {
      // High quality → correct classification with high confidence
      return {
        type: trueClassification,
        confidence: Math.min(0.95, imageQuality),
        features: simulatedFeatures ?? deriveFeatures(trueClassification),
      };
    }
    if (imageQuality > 0.3) {
      // Medium quality → may return broader category
      const broadCategory = getBroadCategory(trueClassification);
      return {
        type: broadCategory,
        confidence: imageQuality * 0.6,
        features: simulatedFeatures ?? ['partial_silhouette'],
      };
    }
  }

  // ── No ground truth or low quality: existing generic behaviour ───────
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
