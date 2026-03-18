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
  sensorType: SensorType;
  position: { lat: number; lon: number; alt: number };
  coverage: {
    minAzDeg: number;
    maxAzDeg: number;
    minElDeg: number;
    maxElDeg: number;
    maxRangeM: number;
  };
}> {
  return placed.map((p, i) => ({
    sensorId: `${p.spec.type}-deploy-${i + 1}`,
    sensorType: p.spec.type as SensorType,
    position: {
      lat: p.position.lat,
      lon: p.position.lon,
      alt: 0, // Ground level by default
    },
    coverage: {
      minAzDeg: p.spec.minAzDeg,
      maxAzDeg: p.spec.maxAzDeg,
      minElDeg: 0,
      maxElDeg: 90,
      maxRangeM: p.spec.maxRangeM,
    },
  }));
}
