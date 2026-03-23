import type { SensorInstanceConfig } from './types.js';
import type { SensorBus } from '@eloc2/sensor-bus';
import { SensorInstance } from './base-sensor.js';

// Sensor subclasses will be registered here
const sensorConstructors = new Map<string, new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance>();

export function registerSensorType(
  type: string,
  constructor: new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance,
): void {
  sensorConstructors.set(type, constructor);
}

export function createSensorInstance(config: SensorInstanceConfig, bus: SensorBus): SensorInstance {
  const Constructor = sensorConstructors.get(config.type);
  if (!Constructor) {
    throw new Error(`Unknown sensor type: ${config.type}. Register it with registerSensorType() first.`);
  }
  return new Constructor(config, bus);
}

export function createSensorInstances(configs: SensorInstanceConfig[], bus: SensorBus): SensorInstance[] {
  return configs.map(config => createSensorInstance(config, bus));
}
