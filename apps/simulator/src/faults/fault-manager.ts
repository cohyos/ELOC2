/**
 * Fault injection manager for the simulator.
 * Handles azimuth bias, clock drift, and sensor outage faults.
 */

import type { FaultDefinition } from '../types/scenario.js';

/**
 * Get all faults that are active at the given simulation time.
 */
export function getActiveFaults(
  faults: FaultDefinition[],
  timeSec: number,
): FaultDefinition[] {
  return faults.filter((f) => {
    if (timeSec < f.startTime) return false;
    if (f.endTime !== undefined && timeSec >= f.endTime) return false;
    return true;
  });
}

/**
 * Apply azimuth bias faults to an azimuth measurement.
 * Sums all active azimuth_bias magnitudes and adds to the azimuth.
 */
export function applyAzimuthBias(
  azimuthDeg: number,
  faults: FaultDefinition[],
): number {
  let biased = azimuthDeg;
  for (const f of faults) {
    if (f.type === 'azimuth_bias' && f.magnitude !== undefined) {
      biased += f.magnitude;
    }
  }
  return biased;
}

/**
 * Apply clock drift faults to a timestamp (in milliseconds).
 * Sums all active clock_drift magnitudes (in ms) and adds to the timestamp.
 */
export function applyClockDrift(
  timestampMs: number,
  faults: FaultDefinition[],
): number {
  let drifted = timestampMs;
  for (const f of faults) {
    if (f.type === 'clock_drift' && f.magnitude !== undefined) {
      drifted += f.magnitude;
    }
  }
  return drifted;
}

/**
 * Check if a sensor is currently in outage.
 */
export function isSensorInOutage(
  sensorId: string,
  faults: FaultDefinition[],
): boolean {
  return faults.some(
    (f) => f.type === 'sensor_outage' && f.sensorId === sensorId,
  );
}
