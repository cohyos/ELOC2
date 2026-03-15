import type { EventEnvelope, GeometryEstimateUpdated } from '@eloc2/events';

// ---------------------------------------------------------------------------
// Geometry honesty assertion
// ---------------------------------------------------------------------------

export interface GeometryHonestyResult {
  passed: boolean;
  totalEstimates: number;
  dishonestEstimates: number;
  details: string[];
}

/**
 * Validates that weak geometry is never presented as confirmed_3d.
 *
 * GeometryEstimateUpdated events with quality 'weak' or 'insufficient'
 * should never have classification 'confirmed_3d'.
 */
export function assertGeometryHonesty(
  events: EventEnvelope[],
): GeometryHonestyResult {
  const details: string[] = [];

  const geoEvents = events.filter(
    (e): e is GeometryEstimateUpdated =>
      e.eventType === 'geometry.estimate.updated',
  );

  const totalEstimates = geoEvents.length;
  let dishonestEstimates = 0;

  for (const evt of geoEvents) {
    const { estimateId, quality, classification } = evt.data;

    if (
      (quality === 'weak' || quality === 'insufficient') &&
      classification === 'confirmed_3d'
    ) {
      dishonestEstimates++;
      details.push(
        `Dishonest estimate ${estimateId}: quality=${quality} but classification=${classification}`,
      );
    }
  }

  if (totalEstimates === 0) {
    details.push('No GeometryEstimateUpdated events found');
  }

  const passed = dishonestEstimates === 0 && totalEstimates > 0;

  if (passed) {
    details.push('All geometry estimates are honest');
  }

  return { passed, totalEstimates, dishonestEstimates, details };
}
