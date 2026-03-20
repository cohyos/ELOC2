/**
 * Convert deployment result to SensorDefinition[] for ScenarioDefinition.
 */
import type { PlacedSensor } from './types.js';
import type { SensorState, SensorId, SensorType } from '@eloc2/domain';

/**
 * Convert placed sensors from the optimizer to a format compatible with
 * the scenario system's sensor definitions.
 */
export function exportToSensorDefinitions(placed: PlacedSensor[]): Array<{
  sensorId: string;
  type: SensorType;
  sensorType: SensorType;
  position: { lat: number; lon: number; alt: number };
  coverage: {
    minAzDeg: number;
    maxAzDeg: number;
    minElDeg: number;
    maxElDeg: number;
    maxRangeM: number;
  };
  fov?: { halfAngleHDeg: number; halfAngleVDeg: number };
  slewRateDegPerSec?: number;
}> {
  return placed.map((p, i) => ({
    sensorId: p.spec.id || `${p.spec.type}-deploy-${i + 1}`,
    type: p.spec.type as SensorType,
    sensorType: p.spec.type as SensorType, // kept for backward compat
    position: {
      lat: p.position.lat,
      lon: p.position.lon,
      alt: p.position.alt ?? 0,
    },
    coverage: {
      minAzDeg: p.spec.minAzDeg,
      maxAzDeg: p.spec.maxAzDeg,
      minElDeg: 0,
      maxElDeg: 90,
      maxRangeM: p.spec.maxRangeM,
    },
    // Include EO-specific fields for proper scenario import
    ...(p.spec.type === 'eo' ? {
      fov: {
        halfAngleHDeg: p.spec.fovHalfAngleDeg,
        halfAngleVDeg: Math.max(1, p.spec.fovHalfAngleDeg * 0.75),
      },
      slewRateDegPerSec: 30,
    } : {}),
  }));
}
