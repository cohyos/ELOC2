/**
 * Geometry projection — builds GeometryEstimate domain objects and
 * creates GeometryEstimateUpdated events from triangulation results.
 */

import type {
  EoTrackId,
  GeometryEstimate,
  Timestamp,
} from '@eloc2/domain';
import type { GeometryEstimateUpdated } from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';
import { generateId } from '@eloc2/shared-utils';
import type { TriangulationResult } from '../triangulation/triangulator.js';
import {
  scoreQuality,
  classifyGeometry,
  estimateCovariance,
} from '../quality/quality-scorer.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a GeometryEstimate from a triangulation result.
 *
 * @param result  The output of a triangulation computation.
 * @param eoTrackIds  The EO track IDs contributing to this estimate.
 * @param bearingNoiseDeg  Assumed bearing noise (1-sigma) in degrees.
 * @param timeAlignmentQualityMs  Time alignment quality in milliseconds.
 * @param baselineM  Approximate baseline between sensors in meters.
 */
export function buildGeometryEstimate(
  result: TriangulationResult,
  eoTrackIds: EoTrackId[],
  bearingNoiseDeg: number,
  timeAlignmentQualityMs: number = 0,
  baselineM: number = 30000,
): GeometryEstimate {
  const quality = scoreQuality(result.intersectionAngleDeg);
  const classification = classifyGeometry(quality, result.numBearings);

  // Use triangulation residual covariance if available, otherwise estimate analytically
  const covariance3D =
    result.residualCovariance ??
    estimateCovariance(result.intersectionAngleDeg, baselineM, bearingNoiseDeg);

  // For bearing_only classification, do not report a 3D position
  const hasSufficientGeometry = classification !== 'bearing_only';

  return {
    estimateId: generateId(),
    eoTrackIds,
    position3D: hasSufficientGeometry ? result.position : undefined,
    covariance3D: hasSufficientGeometry ? covariance3D : undefined,
    quality,
    classification,
    intersectionAngleDeg: result.intersectionAngleDeg,
    timeAlignmentQualityMs,
    bearingNoiseDeg,
  };
}

/**
 * Create a GeometryEstimateUpdated event from a GeometryEstimate.
 */
export function createGeometryEvent(
  estimate: GeometryEstimate,
): GeometryEstimateUpdated {
  const envelope = createEventEnvelope(
    'geometry.estimate.updated',
    'geometry-service',
  );

  return {
    ...envelope,
    eventType: 'geometry.estimate.updated',
    data: {
      estimateId: estimate.estimateId,
      eoTrackIds: estimate.eoTrackIds,
      classification: estimate.classification,
      quality: estimate.quality,
      position3D: estimate.position3D,
      covariance3D: estimate.covariance3D,
    },
  };
}
