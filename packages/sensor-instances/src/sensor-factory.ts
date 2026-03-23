import type { SensorInstanceConfig } from './types.js';
import type { SensorBus } from '@eloc2/sensor-bus';
import { SensorInstance } from './base-sensor.js';

// ---------------------------------------------------------------------------
// Sensor Factory
// ---------------------------------------------------------------------------

/** Registry of sensor type constructors */
const sensorConstructors = new Map<
  string,
  new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance
>();

/**
 * Register a sensor subclass constructor for a given type string.
 * Call this once per sensor type (e.g. 'radar', 'eo', 'c4isr') before
 * using `createSensorInstance`.
 */
export function registerSensorType(
  type: string,
  constructor: new (config: SensorInstanceConfig, bus: SensorBus) => SensorInstance,
): void {
  sensorConstructors.set(type, constructor);
}

/**
 * Create a single SensorInstance from config. The sensor type must have
 * been previously registered via `registerSensorType()`.
 *
 * @throws Error if the sensor type is not registered.
 */
export function createSensorInstance(
  config: SensorInstanceConfig,
  bus: SensorBus,
): SensorInstance {
  const Constructor = sensorConstructors.get(config.type);
  if (!Constructor) {
    throw new Error(
      `Unknown sensor type: ${config.type}. Register it with registerSensorType() first.`,
    );
  }
  return new Constructor(config, bus);
}

/**
 * Batch-create SensorInstance[] from an array of configs, all sharing
 * the same SensorBus.
 */
export function createSensorInstances(
  configs: SensorInstanceConfig[],
  bus: SensorBus,
): SensorInstance[] {
  return configs.map((config) => createSensorInstance(config, bus));
}
