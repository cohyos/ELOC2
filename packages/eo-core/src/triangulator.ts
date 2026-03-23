/**
 * Triangulator wrapper — adapts sensor-bus BearingMeasurementReport
 * to the @eloc2/geometry triangulation API.
 */

import type { Position3D, BearingMeasurement } from '@eloc2/domain';
import { triangulateMultiple, scoreQuality } from '@eloc2/geometry';
import type { BearingMeasurementReport } from '@eloc2/sensor-bus';

import type { TriangulationOutput } from './types.js';

/**
 * Triangulate a target position from bearings reported by ≥2 sensors.
 * Returns null if triangulation fails or fewer than 2 sensors.
 */
export function triangulateFromBearings(
  bearingGroups: Array<{ sensorId: string; bearing: BearingMeasurementReport }>,
): TriangulationOutput | null {
  if (bearingGroups.length < 2) return null;

  // Build parallel arrays for geometry API
  const sensorPositions: Position3D[] = bearingGroups.map(
    (g) => g.bearing.sensorPosition,
  );
  const bearings: BearingMeasurement[] = bearingGroups.map(
    (g) => g.bearing.bearing,
  );

  try {
    const result = triangulateMultiple(sensorPositions, bearings);
    if (!result || !result.position) return null;

    const quality = scoreQuality(result.intersectionAngleDeg);

    return {
      position: result.position,
      quality,
      intersectionAngleDeg: result.intersectionAngleDeg,
      averageMissDistanceM: result.averageMissDistance,
      sensorCount: bearingGroups.length,
      sensorIds: bearingGroups.map((g) => g.sensorId),
    };
  } catch {
    return null;
  }
}
