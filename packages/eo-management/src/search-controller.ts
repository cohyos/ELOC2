/**
 * SearchController — Manages EO sensor search patterns when no targets assigned.
 *
 * Portable: operates on generic sensor IDs and coverage parameters.
 * Supports sector and raster scan patterns with elevation stepping.
 */

export interface SearchSensorState {
  active: boolean;
  pattern: 'sector' | 'raster';
  currentAzimuth: number;
  currentElevation: number;
  scanStart: number;
  scanEnd: number;
  scanSpeed: number;
  idleTickCount: number;
  elevationMin: number;
  elevationMax: number;
  elevationStep: number;
  elevationDirection: 1 | -1;
}

export interface SearchControllerConfig {
  /** Ticks of idle before entering search mode. */
  idleThreshold: number;
  /** Default scan speed in deg/sec. */
  defaultScanSpeed: number;
  /** Default elevation step in degrees. */
  defaultElevationStep: number;
}

const DEFAULT_CONFIG: SearchControllerConfig = {
  idleThreshold: 3,
  defaultScanSpeed: 5,
  defaultElevationStep: 5,
};

export class SearchController {
  private searchState = new Map<string, SearchSensorState>();
  private config: SearchControllerConfig;

  constructor(config?: Partial<SearchControllerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update search mode for a set of sensors.
   * Sensors with active dwells or locks should have `hasDwellOrLock=true`.
   */
  updateSensors(
    sensors: Array<{
      sensorId: string;
      hasDwellOrLock: boolean;
      coverage?: { minAzDeg: number; maxAzDeg: number; minElDeg: number; maxElDeg: number };
    }>,
    dtSec: number,
  ): void {
    for (const sensor of sensors) {
      let state = this.searchState.get(sensor.sensorId);
      if (!state) {
        state = {
          active: false,
          pattern: 'sector',
          currentAzimuth: sensor.coverage?.minAzDeg ?? 0,
          scanStart: sensor.coverage?.minAzDeg ?? 0,
          scanEnd: sensor.coverage?.maxAzDeg ?? 360,
          scanSpeed: this.config.defaultScanSpeed,
          idleTickCount: 0,
          currentElevation: sensor.coverage?.minElDeg ?? 0,
          elevationMin: sensor.coverage?.minElDeg ?? 0,
          elevationMax: sensor.coverage?.maxElDeg ?? 30,
          elevationStep: this.config.defaultElevationStep,
          elevationDirection: 1,
        };
        this.searchState.set(sensor.sensorId, state);
      }

      if (sensor.hasDwellOrLock) {
        state.active = false;
        state.idleTickCount = 0;
      } else {
        state.idleTickCount++;
        if (state.idleTickCount >= this.config.idleThreshold) {
          state.active = true;
          state.currentAzimuth += state.scanSpeed * dtSec;
          if (state.currentAzimuth > state.scanEnd) {
            state.currentAzimuth = state.scanStart;
            state.currentElevation += state.elevationStep * state.elevationDirection;
            if (state.currentElevation >= state.elevationMax) {
              state.elevationDirection = -1;
              state.currentElevation = state.elevationMax;
            } else if (state.currentElevation <= state.elevationMin) {
              state.elevationDirection = 1;
              state.currentElevation = state.elevationMin;
            }
          }
        }
      }
    }
  }

  /** Get search state for a specific sensor. */
  getState(sensorId: string): SearchSensorState | undefined {
    return this.searchState.get(sensorId);
  }

  /** Get all sensor search states. */
  getAllStates(): Array<{ sensorId: string } & SearchSensorState> {
    return [...this.searchState.entries()].map(([sensorId, state]) => ({
      sensorId,
      ...state,
    }));
  }

  /** Check if any sensor is actively searching. */
  get hasActiveSearch(): boolean {
    return [...this.searchState.values()].some(s => s.active);
  }

  /** Reset all state. */
  reset(): void {
    this.searchState.clear();
  }
}
