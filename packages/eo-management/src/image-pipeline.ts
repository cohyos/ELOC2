import type { SystemTrack, SensorState, TargetClassification } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Image target pipeline
// ---------------------------------------------------------------------------

/**
 * Models the image-target pipeline for EO sensors.
 *
 * When the target's angular size is LARGER than the sensor IFOV, the target
 * is resolved and image-level features can be extracted:
 *   - Shape descriptor (aspect ratio proxy)
 *   - Apparent size (pixels, simulated)
 *   - Direct classification from image features
 *
 * This is a simplified/simulated model.
 */

export interface ImagePipelineResult {
  trackId: string;
  sensorId: string;
  angularSizeMrad: number;
  apparentPixels: number;
  shapeDescriptor: 'elongated' | 'compact' | 'irregular' | 'unknown';
  suggestedClassification: TargetClassification | null;
  classificationConfidence: number;
}

/**
 * Simulate image-target processing for a resolved target.
 *
 * @param track  - The system track being observed
 * @param sensor - The observing EO sensor
 * @param sensorIfovMrad - Sensor IFOV in milliradians
 * @param targetSizeM    - Physical target size in metres
 * @returns ImagePipelineResult or null if target is not resolved
 */
export function runImagePipeline(
  track: SystemTrack,
  sensor: SensorState,
  sensorIfovMrad: number,
  targetSizeM = 10,
): ImagePipelineResult | null {
  if (!sensor.online || sensor.sensorType !== 'eo') return null;

  // Compute slant range
  const dLat = track.state.lat - sensor.position.lat;
  const dLon = track.state.lon - sensor.position.lon;
  const dAlt = (track.state.alt ?? 0) - (sensor.position.alt ?? 0);
  const groundDistM = Math.sqrt(dLat * dLat + dLon * dLon) * 111_320;
  const slantRangeM = Math.sqrt(groundDistM * groundDistM + dAlt * dAlt);

  if (slantRangeM < 1) return null;

  const angularSizeMrad = (targetSizeM / slantRangeM) * 1000;

  // Only produce image results when resolved (angular size > IFOV)
  if (angularSizeMrad < sensorIfovMrad) return null;

  // Apparent size in pixels (angular size / IFOV)
  const apparentPixels = Math.round(angularSizeMrad / sensorIfovMrad);

  // Shape descriptor based on velocity (simple proxy)
  let shapeDescriptor: ImagePipelineResult['shapeDescriptor'] = 'unknown';
  if (track.velocity) {
    const speed = Math.sqrt(
      track.velocity.vx ** 2 + track.velocity.vy ** 2 + (track.velocity.vz ?? 0) ** 2,
    );
    if (speed > 200) shapeDescriptor = 'elongated';      // fast → likely aircraft
    else if (speed > 30) shapeDescriptor = 'compact';     // medium → helicopter/UAV
    else shapeDescriptor = 'irregular';                    // slow → ground or hovering
  }

  // Classification from image features (simplified model)
  let suggestedClassification: TargetClassification | null = null;
  let classificationConfidence = 0;

  if (apparentPixels >= 10) {
    // Enough pixels for reliable classification
    if (shapeDescriptor === 'elongated') {
      suggestedClassification = 'fighter_aircraft' as TargetClassification;
      classificationConfidence = Math.min(0.95, 0.5 + apparentPixels * 0.02);
    } else if (shapeDescriptor === 'compact') {
      suggestedClassification = 'uav' as TargetClassification;
      classificationConfidence = Math.min(0.85, 0.4 + apparentPixels * 0.02);
    } else {
      suggestedClassification = 'unknown' as TargetClassification;
      classificationConfidence = 0.3;
    }
  } else if (apparentPixels >= 3) {
    // Marginal resolution — low-confidence classification
    suggestedClassification = 'unknown' as TargetClassification;
    classificationConfidence = 0.2;
  }

  return {
    trackId: track.systemTrackId as string,
    sensorId: sensor.sensorId as string,
    angularSizeMrad,
    apparentPixels,
    shapeDescriptor,
    suggestedClassification,
    classificationConfidence,
  };
}
