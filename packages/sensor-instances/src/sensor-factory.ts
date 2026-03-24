import type { SensorInstanceConfig, EoBearingGenerator, RadarObservationGenerator, C4isrObservationGenerator } from './types.js';
import type { SensorBus } from '@eloc2/sensor-bus';
import { SensorInstance } from './base-sensor.js';
import { RadarSensorInstance } from './radar-sensor.js';
import { EoSensorInstance } from './eo-sensor.js';
import { C4isrSensorInstance } from './c4isr-sensor.js';

// ---------------------------------------------------------------------------
// Observation Generator Registry
// ---------------------------------------------------------------------------

/**
 * Optional observation generators for decoupling from @eloc2/simulator.
 * When provided, sensor instances use these instead of the simulator defaults.
 */
export interface ObservationGenerators {
  eo?: EoBearingGenerator;
  radar?: RadarObservationGenerator;
  c4isr?: C4isrObservationGenerator;
}

// ---------------------------------------------------------------------------
// Sensor Factory
// ---------------------------------------------------------------------------

/** Registry of sensor type constructors */
const sensorConstructors = new Map<
  string,
  new (config: SensorInstanceConfig, bus: SensorBus, generator?: any) => SensorInstance
>();

/**
 * Register a sensor subclass constructor for a given type string.
 * Call this once per sensor type (e.g. 'radar', 'eo', 'c4isr') before
 * using `createSensorInstance`.
 */
export function registerSensorType(
  type: string,
  constructor: new (config: SensorInstanceConfig, bus: SensorBus, generator?: any) => SensorInstance,
): void {
  sensorConstructors.set(type, constructor);
}

/**
 * Create a single SensorInstance from config. The sensor type must have
 * been previously registered via `registerSensorType()`, OR be one of the
 * built-in types ('radar', 'eo', 'c4isr').
 *
 * @param config - Sensor configuration
 * @param bus - SensorBus for inter-component messaging
 * @param generators - Optional observation generators (for DI / external data sources)
 * @throws Error if the sensor type is not registered.
 */
export function createSensorInstance(
  config: SensorInstanceConfig,
  bus: SensorBus,
  generators?: ObservationGenerators,
): SensorInstance {
  // Check registered constructors first
  const Constructor = sensorConstructors.get(config.type);
  if (Constructor) {
    const gen = generators?.[config.type as keyof ObservationGenerators];
    return new Constructor(config, bus, gen);
  }

  // Built-in types with DI support
  switch (config.type) {
    case 'radar':
      return new RadarSensorInstance(config, bus, generators?.radar);
    case 'eo':
      return new EoSensorInstance(config, bus, generators?.eo);
    case 'c4isr':
      return new C4isrSensorInstance(config, bus, generators?.c4isr);
    default:
      throw new Error(
        `Unknown sensor type: ${config.type}. Register it with registerSensorType() first.`,
      );
  }
}

/**
 * Batch-create SensorInstance[] from an array of configs, all sharing
 * the same SensorBus and optional observation generators.
 */
export function createSensorInstances(
  configs: SensorInstanceConfig[],
  bus: SensorBus,
  generators?: ObservationGenerators,
): SensorInstance[] {
  return configs.map((config) => createSensorInstance(config, bus, generators));
}
