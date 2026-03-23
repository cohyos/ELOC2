/**
 * ConvergenceMonitor — Tracks EO triangulation convergence over time.
 *
 * Monitors how position uncertainty decreases as more bearings are accumulated.
 * Portable: operates on generic track IDs and covariance values.
 */

export interface ConvergenceMeasurement {
  timestamp: number;
  positionErrorEstimate: number;
  numBearings: number;
}

export interface ConvergenceState {
  trackId: string;
  measurements: ConvergenceMeasurement[];
  convergenceRate: number;
  converged: boolean;
}

export interface ConvergenceMonitorConfig {
  /** Max measurements to retain per track. */
  maxMeasurements: number;
  /** Minimum measurements before computing convergence rate. */
  minMeasurements: number;
  /** Convergence rate threshold (0-1) to declare converged. */
  convergenceThreshold: number;
  /** Position error below which to declare converged (m²). */
  errorThreshold: number;
}

const DEFAULT_CONFIG: ConvergenceMonitorConfig = {
  maxMeasurements: 20,
  minMeasurements: 3,
  convergenceThreshold: 0.5,
  errorThreshold: 0.01,
};

export class ConvergenceMonitor {
  private state = new Map<string, ConvergenceState>();
  private config: ConvergenceMonitorConfig;

  constructor(config?: Partial<ConvergenceMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update convergence for a set of tracks.
   * @param tracks Array of {trackId, covariance} to monitor
   * @param simTimeSec Current simulation time
   */
  update(
    tracks: Array<{
      trackId: string;
      covariance?: number[][];
      sourceCount?: number;
    }>,
    simTimeSec: number,
  ): void {
    for (const track of tracks) {
      let entry = this.state.get(track.trackId);
      if (!entry) {
        entry = {
          trackId: track.trackId,
          measurements: [],
          convergenceRate: 0,
          converged: false,
        };
        this.state.set(track.trackId, entry);
      }

      const posError = Math.sqrt(
        (track.covariance?.[0]?.[0] ?? 0) +
        (track.covariance?.[1]?.[1] ?? 0),
      );

      entry.measurements.push({
        timestamp: simTimeSec,
        positionErrorEstimate: posError,
        numBearings: track.sourceCount ?? 0,
      });

      if (entry.measurements.length > this.config.maxMeasurements) {
        entry.measurements = entry.measurements.slice(-this.config.maxMeasurements);
      }

      if (entry.measurements.length >= this.config.minMeasurements) {
        const first = entry.measurements[0].positionErrorEstimate;
        const last = entry.measurements[entry.measurements.length - 1].positionErrorEstimate;
        if (first > 0) {
          entry.convergenceRate = 1 - (last / first);
        }
        entry.converged = entry.convergenceRate > this.config.convergenceThreshold
          && last < this.config.errorThreshold;
      }
    }
  }

  /** Get convergence state for a track. */
  getState(trackId: string): ConvergenceState | undefined {
    return this.state.get(trackId);
  }

  /** Get all convergence states. */
  getAllStates(): ConvergenceState[] {
    return [...this.state.values()];
  }

  /** Check if a track has converged. */
  isConverged(trackId: string): boolean {
    return this.state.get(trackId)?.converged ?? false;
  }

  /** Reset all state. */
  reset(): void {
    this.state.clear();
  }
}
