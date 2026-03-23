/**
 * DwellManager — Manages EO sensor dwell assignments and operator overrides.
 *
 * Portable: can be used independently of LiveEngine or any specific
 * simulation framework. Operates on generic sensor/track IDs.
 */

export interface DwellAssignment {
  sensorId: string;
  targetTrackId: string;
  dwellStartSec: number;
  dwellDurationSec: number;
}

export interface DwellManagerConfig {
  defaultDwellSec: number;
}

const DEFAULT_CONFIG: DwellManagerConfig = {
  defaultDwellSec: 15,
};

export class DwellManager {
  private dwellState = new Map<string, DwellAssignment>();
  private dwellOverrides = new Map<string, number>();
  private lockedSensors = new Set<string>();
  private config: DwellManagerConfig;

  constructor(config?: Partial<DwellManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Assign a sensor to dwell on a target. */
  assignDwell(sensorId: string, targetTrackId: string, simTimeSec: number): void {
    if (this.lockedSensors.has(sensorId)) return;

    const duration = this.dwellOverrides.get(sensorId) ?? this.config.defaultDwellSec;
    this.dwellState.set(sensorId, {
      sensorId,
      targetTrackId,
      dwellStartSec: simTimeSec,
      dwellDurationSec: duration,
    });
  }

  /** Expire completed dwells. */
  expireDwells(simTimeSec: number): void {
    for (const [sensorId, dwell] of this.dwellState) {
      if (simTimeSec - dwell.dwellStartSec >= dwell.dwellDurationSec) {
        this.dwellState.delete(sensorId);
      }
    }
  }

  /** Lock a sensor (operator override — prevents reassignment). */
  lockSensor(sensorId: string): void {
    this.lockedSensors.add(sensorId);
  }

  /** Release a locked sensor. */
  releaseSensor(sensorId: string): void {
    this.lockedSensors.delete(sensorId);
  }

  /** Set operator dwell duration override for a sensor. */
  setDwellOverride(sensorId: string, durationSec: number): void {
    this.dwellOverrides.set(sensorId, Math.max(1, durationSec));
  }

  /** Check if a sensor is currently dwelling. */
  hasDwell(sensorId: string): boolean {
    return this.dwellState.has(sensorId);
  }

  /** Check if a sensor is locked. */
  isLocked(sensorId: string): boolean {
    return this.lockedSensors.has(sensorId);
  }

  /** Get all active dwells. */
  getActiveDwells(): DwellAssignment[] {
    return [...this.dwellState.values()];
  }

  /** Get active dwell count. */
  get activeDwellCount(): number {
    return this.dwellState.size;
  }

  /** Get dwell info for a sensor. */
  getDwell(sensorId: string): DwellAssignment | undefined {
    return this.dwellState.get(sensorId);
  }

  /** Reset all state. */
  reset(): void {
    this.dwellState.clear();
    this.dwellOverrides.clear();
    this.lockedSensors.clear();
  }
}
