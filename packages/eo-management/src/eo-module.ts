import type {
  SystemTrack,
  SensorState,
  GeometryEstimate,
  TargetClassification,
} from '@eloc2/domain';
import {
  generateCandidates,
  scoreCandidate,
  applyPolicy,
  assignTasks,
} from '@eloc2/eo-tasking';
import type { ScoringWeights } from '@eloc2/eo-tasking';
import {
  triangulateMultiple,
  buildGeometryEstimate,
  scoreQuality,
} from '@eloc2/geometry';

import { TrackIngester } from './ingest.js';
import { ModeController } from './mode-controller.js';
import type { ModeDecision } from './mode-controller.js';
import type {
  EoModuleOutput,
  EoModuleStatus,
  EoModuleMode,
  OperatorCommand,
  TrackEnrichment,
  SearchState,
  ConvergenceEntry,
  SensorAllocation,
  PipelineStatus,
} from './types.js';
import { DEFAULT_INGEST_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EO_TASKING_INTERVAL_SEC = 3; // unified with live-engine.ts
const DEFAULT_DWELL_SEC = 15;

// ---------------------------------------------------------------------------
// EoManagementModule
// ---------------------------------------------------------------------------

/**
 * Unified EO management module that composes existing EO packages
 * behind a clean interface boundary.
 *
 * This module encapsulates:
 *   - Track ingestion and filtering
 *   - Sub-pixel / image pipeline mode selection
 *   - EO tasking (candidate generation, scoring, policy, assignment)
 *   - Dwell management and sensor allocation tracking
 *   - Convergence monitoring
 *   - Search mode state
 *   - Operator command handling
 *
 * The LiveEngine delegates to this module for all EO-related processing,
 * while retaining ownership of the detailed bearing/triangulation logic
 * that is tightly coupled to the simulation events.
 */
export class EoManagementModule {
  // ── Sub-components ───────────────────────────────────────────────────
  private ingester = new TrackIngester();
  private modeController = new ModeController();

  // ── Internal state ───────────────────────────────────────────────────
  private tickCount = 0;
  private lastTaskingSec = 0;
  private totalTracksIngested = 0;
  private enrichedTrackIds = new Set<string>();

  /** Current tracks and sensors (refreshed each ingest). */
  private currentTracks: SystemTrack[] = [];
  private currentEoSensors: SensorState[] = [];

  /** Dwell tracking: sensorId → dwell info. */
  private dwellState = new Map<string, {
    sensorId: string;
    targetTrackId: string;
    dwellStartSec: number;
    dwellDurationSec: number;
  }>();

  /** Operator dwell overrides per sensor. */
  private dwellOverrides = new Map<string, number>();

  /** Operator-locked sensors. */
  private lockedSensors = new Set<string>();

  /** Operator priority tracks. */
  private priorityTracks = new Map<string, 'high' | 'normal' | 'low'>();

  /** Search mode state per sensor. */
  private searchState = new Map<string, {
    active: boolean;
    pattern: 'sector' | 'raster';
    currentAzimuth: number;
    scanStart: number;
    scanEnd: number;
    scanSpeed: number;
    idleTickCount: number;
    // Elevation scan (azimuth + elevation grid)
    currentElevation: number;
    elevationMin: number;
    elevationMax: number;
    elevationStep: number;
    elevationDirection: 1 | -1;
  }>();

  /** Convergence monitoring per track. */
  private convergenceState = new Map<string, {
    trackId: string;
    measurements: Array<{
      timestamp: number;
      positionErrorEstimate: number;
      numBearings: number;
    }>;
    convergenceRate: number;
    converged: boolean;
  }>();

  /** Last mode decisions (from most recent tick). */
  private lastDecisions: ModeDecision[] = [];

  /** Scoring weights (can be tuned at runtime). */
  private weights: ScoringWeights = {
    threat: 1.0,
    uncertaintyReduction: 1.0,
    geometryGain: 0.5,
    operatorIntent: 2.0,
    slewCost: 0.3,
    occupancyCost: 0.5,
  };

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Receive tracks from the C4ISR bus. Filters and prioritises them for
   * EO processing. Call this before tick().
   */
  ingestTracks(tracks: SystemTrack[], sensors: SensorState[]): void {
    this.currentTracks = this.ingester.filter(tracks);
    this.currentEoSensors = this.ingester.filterEoSensors(sensors);
    this.totalTracksIngested += this.currentTracks.length;
  }

  /**
   * Run one tick of EO management.
   *
   * This performs:
   *   1. Pipeline mode selection (sub-pixel vs image) for each track-sensor pair
   *   2. Convergence monitoring updates
   *   3. EO tasking cycle (if interval elapsed)
   *   4. Search mode updates for idle sensors
   *
   * @param simTime - Current simulation time in seconds
   * @param dtSec   - Time step in seconds
   * @returns EoModuleOutput with enrichments, geometry, search/convergence state
   */
  tick(simTime: number, dtSec: number): EoModuleOutput {
    this.tickCount++;

    // 1. Run pipeline mode selection
    this.lastDecisions = this.modeController.process(
      this.currentTracks,
      this.currentEoSensors,
    );

    // 2. Collect enrichments from pipeline results
    const enrichments = this.collectEnrichments(this.lastDecisions);

    // 3. Update convergence state
    this.updateConvergence(simTime);

    // 4. Run EO tasking if interval elapsed
    let tasksAssigned = 0;
    if (simTime - this.lastTaskingSec >= EO_TASKING_INTERVAL_SEC) {
      tasksAssigned = this.runTaskingCycle(simTime);
      this.lastTaskingSec = simTime;
    }

    // 5. Update search mode for sensors with no targets
    this.updateSearchMode(dtSec);

    // 6. Count active dwells
    const activeDwells = this.dwellState.size;

    // 7. Expire completed dwells
    this.expireDwells(simTime);

    return {
      enrichments,
      geometryEstimates: new Map(), // Geometry is still computed by LiveEngine
      searchStates: this.getSearchStates(),
      convergenceStates: this.getConvergenceEntries(),
      activeDwells,
      tasksAssigned,
    };
  }

  /**
   * Handle operator commands (lock, release, classify, priority, set_dwell).
   */
  handleOperatorCommand(cmd: OperatorCommand): void {
    switch (cmd.type) {
      case 'lock':
        if (cmd.sensorId) this.lockedSensors.add(cmd.sensorId);
        break;
      case 'release':
        if (cmd.sensorId) this.lockedSensors.delete(cmd.sensorId);
        break;
      case 'classify':
        // Classification is handled externally on the track — we just record intent
        break;
      case 'priority':
        if (cmd.trackId && cmd.priority) {
          this.priorityTracks.set(cmd.trackId, cmd.priority);
        }
        break;
      case 'set_dwell':
        if (cmd.sensorId && cmd.dwellDurationSec != null) {
          this.dwellOverrides.set(cmd.sensorId, Math.max(1, cmd.dwellDurationSec));
        }
        break;
    }
  }

  /**
   * Get current module status snapshot.
   */
  getStatus(): EoModuleStatus {
    const mode = this.computeMode();
    const activePipelines = this.modeController.summarise(this.lastDecisions);

    const sensorAllocations: SensorAllocation[] = this.currentEoSensors.map(s => {
      const sid = s.sensorId as string;
      const dwell = this.dwellState.get(sid);
      const search = this.searchState.get(sid);

      if (dwell) {
        return {
          sensorId: sid,
          targetTrackId: dwell.targetTrackId,
          mode: 'dwell' as const,
          dwellRemainingSec: Math.max(0, dwell.dwellDurationSec -
            (this.tickCount - dwell.dwellStartSec)),
        };
      }
      if (search?.active) {
        return {
          sensorId: sid,
          targetTrackId: null,
          mode: 'search' as const,
          dwellRemainingSec: 0,
        };
      }
      return {
        sensorId: sid,
        targetTrackId: null,
        mode: 'idle' as const,
        dwellRemainingSec: 0,
      };
    });

    return {
      mode,
      activePipelines,
      sensorAllocations,
      enrichedTrackCount: this.enrichedTrackIds.size,
      totalTracksIngested: this.totalTracksIngested,
      tickCount: this.tickCount,
    };
  }

  /**
   * Reset all internal state.
   */
  reset(): void {
    this.tickCount = 0;
    this.lastTaskingSec = 0;
    this.totalTracksIngested = 0;
    this.enrichedTrackIds.clear();
    this.currentTracks = [];
    this.currentEoSensors = [];
    this.dwellState.clear();
    this.dwellOverrides.clear();
    this.lockedSensors.clear();
    this.priorityTracks.clear();
    this.searchState.clear();
    this.convergenceState.clear();
    this.lastDecisions = [];
    this.modeController.reset();
  }

  /**
   * Set scoring weights for the tasking cycle.
   */
  setWeights(weights: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private collectEnrichments(decisions: ModeDecision[]): TrackEnrichment[] {
    const enrichmentMap = new Map<string, TrackEnrichment>();

    for (const d of decisions) {
      if (d.pipeline === 'none') continue;

      const existing = enrichmentMap.get(d.trackId);
      const classificationProduced = d.imageResult?.suggestedClassification != null
        && d.imageResult.classificationConfidence > 0.5;

      if (!existing) {
        enrichmentMap.set(d.trackId, {
          trackId: d.trackId,
          geometryImproved: d.subPixelResult != null,
          classificationProduced,
          pipeline: d.pipeline as 'sub-pixel' | 'image',
        });
      } else {
        // Upgrade pipeline if image is available
        if (d.pipeline === 'image') {
          existing.pipeline = 'image';
          existing.classificationProduced = existing.classificationProduced || classificationProduced;
        }
        existing.geometryImproved = true;
      }

      this.enrichedTrackIds.add(d.trackId);
    }

    return [...enrichmentMap.values()];
  }

  private runTaskingCycle(simTime: number): number {
    if (this.currentTracks.length === 0 || this.currentEoSensors.length === 0) {
      return 0;
    }

    // Use eo-tasking to generate candidates
    const candidates = generateCandidates(this.currentTracks, this.currentEoSensors);

    // Score each candidate
    const scored = candidates.map(c => ({
      candidate: c,
      score: scoreCandidate(c, this.weights, new Set()),
    }));

    // Apply policy
    const decisions = applyPolicy(scored, 'auto_with_veto', []);

    // Filter approved
    const approved = decisions.filter(d => d.approved);

    // Assign tasks (using existing assigner)
    if (approved.length > 0) {
      const assignments = assignTasks(approved, 'auto_with_veto');

      // Track new dwells
      for (const a of assignments) {
        const sid = a.sensorId as string;
        if (this.lockedSensors.has(sid)) continue;

        const dwellDuration = this.dwellOverrides.get(sid) ?? DEFAULT_DWELL_SEC;
        this.dwellState.set(sid, {
          sensorId: sid,
          targetTrackId: a.systemTrackId as string,
          dwellStartSec: simTime,
          dwellDurationSec: dwellDuration,
        });
      }

      return assignments.length;
    }

    return 0;
  }

  private expireDwells(simTime: number): void {
    for (const [sensorId, dwell] of this.dwellState) {
      const elapsed = simTime - dwell.dwellStartSec;
      if (elapsed >= dwell.dwellDurationSec) {
        this.dwellState.delete(sensorId);
      }
    }
  }

  private updateSearchMode(dtSec: number): void {
    for (const sensor of this.currentEoSensors) {
      const sid = sensor.sensorId as string;
      const hasDwell = this.dwellState.has(sid);

      let state = this.searchState.get(sid);
      if (!state) {
        state = {
          active: false,
          pattern: 'sector',
          currentAzimuth: sensor.coverage?.minAzDeg ?? 0,
          scanStart: sensor.coverage?.minAzDeg ?? 0,
          scanEnd: sensor.coverage?.maxAzDeg ?? 360,
          scanSpeed: 5,
          idleTickCount: 0,
          // Elevation scan defaults: 0-30° in 5° steps
          currentElevation: sensor.coverage?.minElDeg ?? 0,
          elevationMin: sensor.coverage?.minElDeg ?? 0,
          elevationMax: sensor.coverage?.maxElDeg ?? 30,
          elevationStep: 5,
          elevationDirection: 1,
        };
        this.searchState.set(sid, state);
      }

      if (hasDwell || this.lockedSensors.has(sid)) {
        state.active = false;
        state.idleTickCount = 0;
      } else {
        state.idleTickCount += dtSec; // accumulate elapsed time, not tick count
        if (state.idleTickCount >= 3) { // 3 seconds idle (works at any tick rate)
          state.active = true;
          // Advance scan: azimuth sweep with elevation stepping
          state.currentAzimuth += state.scanSpeed * dtSec;
          if (state.currentAzimuth > state.scanEnd) {
            state.currentAzimuth = state.scanStart;
            // Step elevation on each azimuth sweep completion
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

  private updateConvergence(simTime: number): void {
    for (const track of this.currentTracks) {
      const tid = track.systemTrackId as string;
      let entry = this.convergenceState.get(tid);
      if (!entry) {
        entry = {
          trackId: tid,
          measurements: [],
          convergenceRate: 0,
          converged: false,
        };
        this.convergenceState.set(tid, entry);
      }

      // Add a measurement based on current covariance
      const posError = Math.sqrt(
        (track.covariance?.[0]?.[0] ?? 0) +
        (track.covariance?.[1]?.[1] ?? 0),
      );

      entry.measurements.push({
        timestamp: simTime,
        positionErrorEstimate: posError,
        numBearings: track.sources?.length ?? 0,
      });

      // Keep last 20 measurements
      if (entry.measurements.length > 20) {
        entry.measurements = entry.measurements.slice(-20);
      }

      // Compute convergence rate (improvement per measurement)
      if (entry.measurements.length >= 3) {
        const first = entry.measurements[0].positionErrorEstimate;
        const last = entry.measurements[entry.measurements.length - 1].positionErrorEstimate;
        if (first > 0) {
          entry.convergenceRate = 1 - (last / first);
        }
        entry.converged = entry.convergenceRate > 0.5 && last < 0.01;
      }
    }
  }

  private getSearchStates(): SearchState[] {
    const result: SearchState[] = [];
    for (const [sensorId, state] of this.searchState) {
      result.push({
        sensorId,
        active: state.active,
        pattern: state.pattern,
        currentAzimuth: state.currentAzimuth,
        currentElevation: state.currentElevation,
      });
    }
    return result;
  }

  private getConvergenceEntries(): ConvergenceEntry[] {
    const result: ConvergenceEntry[] = [];
    for (const [, entry] of this.convergenceState) {
      result.push({
        trackId: entry.trackId,
        measurementCount: entry.measurements.length,
        convergenceRate: entry.convergenceRate,
        converged: entry.converged,
      });
    }
    return result;
  }

  private computeMode(): EoModuleMode {
    const hasDwells = this.dwellState.size > 0;
    const hasSearch = [...this.searchState.values()].some(s => s.active);

    if (hasDwells && hasSearch) return 'mixed';
    if (hasDwells) return 'tracking';
    if (hasSearch) return 'searching';
    return 'idle';
  }
}
