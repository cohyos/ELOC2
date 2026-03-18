/**
 * Live simulation engine.
 *
 * Wires the ScenarioRunner (synthetic sensor data) through the full
 * processing pipeline: registration, fusion, track management,
 * geometry, EO investigation, and EO tasking. Maintains the authoritative
 * system state that all API endpoints read from, and pushes events to
 * WebSocket clients.
 */

import type {
  SystemTrack,
  SensorState,
  SensorId,
  Task,
  TaskId,
  CueId,
  EoTrackId,
  SystemTrackId,
  Timestamp,
  SourceObservation,
  GeometryEstimate,
  RegistrationState,
  EoCue,
  EoTrack,
  UnresolvedGroup,
  BearingMeasurement,
  TargetClassification,
  ClassificationSource,
} from '@eloc2/domain';
import { createLineageEntry } from '@eloc2/domain';
import type { EventEnvelope } from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';
import { ScenarioRunner, interpolatePosition, interpolateVelocity, isTargetActive } from '@eloc2/simulator';
import type { SimulationEvent } from '@eloc2/simulator';
import type { EoBearingObservation } from '@eloc2/simulator';
import { centralIsrael, getScenarioById } from '@eloc2/scenario-library';
import type { ScenarioDefinition } from '@eloc2/scenario-library';
import { TrackManager } from '@eloc2/fusion-core';
import { RegistrationHealthService } from '@eloc2/registration';
import { generateId, bearingDeg } from '@eloc2/shared-utils';
import {
  issueCue,
  isCueValid,
  assessAmbiguity,
  splitGroup,
  mergeIntoGroup,
  handleEoReport,
  createEoReport,
  assessIdentification,
} from '@eloc2/eo-investigation';
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
import {
  selectFusionMode,
  type FusionMode,
} from '@eloc2/fusion-core';
import { SimulationStateMachine } from './state-machine.js';
import type { SimulationState, SimulationAction } from './state-machine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveState {
  tracks: SystemTrack[];
  sensors: SensorState[];
  tasks: Task[];
  geometryEstimates: Map<string, GeometryEstimate>;
  registrationStates: RegistrationState[];
  eventLog: LiveEvent[];
  scenarioId: string;
  running: boolean;
  speed: number;
  elapsedSec: number;
  durationSec: number;
  // Phase 5: EO orchestration state
  eoTracks: EoTrack[];
  unresolvedGroups: UnresolvedGroup[];
  activeCues: EoCue[];
}

export interface LiveEvent {
  id: string;
  eventType: string;
  timestamp: number;
  simTimeSec: number;
  summary: string;
  data?: Record<string, unknown>;
}

type WsClient = { send: (data: string) => void };

export interface InvestigationParameters {
  weights: {
    threat: number;
    uncertaintyReduction: number;
    geometryGain: number;
    operatorIntent: number;
    slewCost: number;
    occupancyCost: number;
  };
  thresholds: {
    splitAngleDeg: number;
    confidenceGate: number;
    cueValidityWindowSec: number;
    convergenceThreshold: number;
  };
  policyMode: 'recommended_only' | 'auto_with_veto' | 'manual';
}

export interface InvestigationSummaryWS {
  trackId: string;
  trackStatus: string;
  investigationStatus: string;
  assignedSensors: string[];
  cuePriority: number;
  bearingCount: number;
  geometryStatus: string;
  hypotheses: Array<{ label: string; probability: number }>;
  scoreBreakdown: {
    threat: number;
    uncertainty: number;
    geometry: number;
    intent: number;
  };
}

const DEFAULT_INVESTIGATION_PARAMETERS: InvestigationParameters = {
  weights: {
    threat: 1.0,
    uncertaintyReduction: 1.0,
    geometryGain: 0.5,
    operatorIntent: 2.0,
    slewCost: 0.3,
    occupancyCost: 0.5,
  },
  thresholds: {
    splitAngleDeg: 0.5,
    confidenceGate: 0.7,
    cueValidityWindowSec: 30,
    convergenceThreshold: 0.85,
  },
  policyMode: 'auto_with_veto',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Run EO tasking every N simulation seconds. */
const EO_TASKING_INTERVAL_SEC = 5;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class LiveEngine {
  private runner: ScenarioRunner;
  private scenario: ScenarioDefinition;
  private trackManager: TrackManager;
  private registrationService: RegistrationHealthService;
  private state: LiveState;
  private stateMachine = new SimulationStateMachine();
  /** Throttle broadcastRap: minimum ms between broadcasts */
  private lastBroadcastTime = 0;
  private static readonly MIN_BROADCAST_INTERVAL_MS = 250;
  private timer: ReturnType<typeof setInterval> | null = null;
  private wsClients = new Set<WsClient>();

  // Phase 5: EO orchestration internal state
  private eoTracksById = new Map<string, EoTrack>();
  private unresolvedGroupsById = new Map<string, UnresolvedGroup>();
  private activeCuesById = new Map<string, EoCue>();
  /** Maps cueId → systemTrackId for cue-to-track lookup. */
  private cueToTrack = new Map<string, string>();
  private operatorPriorityTracks = new Set<string>();
  /** Accumulates bearings per cueId within a tick for batch processing. */
  private pendingBearings = new Map<string, EoBearingObservation[]>();
  private lastEoTaskingSec = 0;
  /** Tracks the active fusion mode per sensor for UI display. */
  private fusionModePerSensor = new Map<string, FusionMode>();
  /** Investigation parameters (runtime-tunable). */
  private currentParameters: InvestigationParameters = { ...DEFAULT_INVESTIGATION_PARAMETERS, weights: { ...DEFAULT_INVESTIGATION_PARAMETERS.weights }, thresholds: { ...DEFAULT_INVESTIGATION_PARAMETERS.thresholds } };
  /** Formal event envelopes for validation runner. */
  private eventEnvelopes: EventEnvelope[] = [];

  constructor(scenarioId?: string) {
    this.scenario = (scenarioId ? getScenarioById(scenarioId) : undefined) ?? centralIsrael;
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 8 });
    this.registrationService = new RegistrationHealthService();

    this.state = this.buildInitialState();
  }

  // ── Injection log ────────────────────────────────────────────────────
  injectionLog: Array<{ id: string; type: string; timestamp: number; details: any }> = [];

  getInjectionLog(): typeof this.injectionLog {
    return this.injectionLog;
  }

  // ── Public API ────────────────────────────────────────────────────────

  getState(): LiveState {
    return this.state;
  }

  getSimulationState(): { state: SimulationState; allowedActions: SimulationAction[] } {
    return {
      state: this.stateMachine.currentState,
      allowedActions: this.stateMachine.getAllowedActions(),
    };
  }

  /** Compute ground truth positions for all active targets at the current sim time. */
  getGroundTruth(): Array<{
    targetId: string;
    name: string;
    position: { lat: number; lon: number; alt: number };
    velocity: { vx: number; vy: number; vz: number } | undefined;
    classification?: string;
    active: true;
  }> {
    const timeSec = this.state.elapsedSec;
    const result: Array<{
      targetId: string;
      name: string;
      position: { lat: number; lon: number; alt: number };
      velocity: { vx: number; vy: number; vz: number } | undefined;
      classification?: string;
      active: true;
    }> = [];

    for (const target of this.scenario.targets) {
      if (!isTargetActive(target, timeSec)) continue;

      const pos = interpolatePosition(target.waypoints, timeSec);
      if (!pos) continue;

      const vel = interpolateVelocity(target.waypoints, timeSec);

      result.push({
        targetId: target.targetId,
        name: target.name,
        position: { lat: pos.lat, lon: pos.lon, alt: pos.alt },
        velocity: vel ? { vx: vel.vx, vy: vel.vy, vz: vel.vz } : undefined,
        ...((target as any).classification ? { classification: (target as any).classification } : {}),
        active: true,
      });
    }

    return result;
  }

  /** Build a full snapshot payload identical to broadcastRap() format. */
  getFullSnapshot(): Record<string, unknown> {
    const tracks = this.state.tracks;
    const lightTracks = tracks.map(t => ({
      ...t,
      lineage: t.lineage.length > 3 ? t.lineage.slice(-3) : t.lineage,
    }));
    const lightCues = this.state.activeCues.map(c => ({
      cueId: c.cueId,
      systemTrackId: c.systemTrackId,
      predictedState: c.predictedState,
      uncertaintyGateDeg: c.uncertaintyGateDeg,
      priority: c.priority,
      validFrom: c.validFrom,
      validTo: c.validTo,
    }));
    const lightTasks = this.state.tasks
      .filter(t => t.status === 'executing' || t.status === 'proposed')
      .map(t => ({
        taskId: t.taskId,
        cueId: t.cueId,
        sensorId: t.sensorId,
        systemTrackId: t.systemTrackId,
        status: t.status,
        scoreBreakdown: t.scoreBreakdown,
        policyMode: t.policyMode,
        createdAt: t.createdAt,
      }));
    return {
      type: 'rap.snapshot',
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      scenarioId: this.scenario.id,
      running: this.state.running,
      speed: this.state.speed,
      trackCount: tracks.length,
      confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: tracks.filter(t => t.status === 'tentative').length,
      tracks: lightTracks,
      sensors: this.state.sensors,
      activeCues: lightCues,
      tasks: lightTasks,
      eoTracks: this.state.eoTracks.slice(-20).map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        associatedSystemTrackId: t.associatedSystemTrackId,
        identificationSupport: t.identificationSupport,
      })),
      geometryEstimates: [...this.state.geometryEstimates.entries()].map(([trackId, est]) => ({
        trackId,
        estimateId: est.estimateId,
        position3D: est.position3D,
        quality: est.quality,
        classification: est.classification,
        intersectionAngleDeg: est.intersectionAngleDeg,
        timeAlignmentQualityMs: est.timeAlignmentQualityMs,
        bearingNoiseDeg: est.bearingNoiseDeg,
        eoTrackIds: est.eoTrackIds,
      })),
      registrationStates: this.state.registrationStates.map(r => ({
        sensorId: r.sensorId,
        spatialQuality: r.spatialQuality,
        timingQuality: r.timingQuality,
        fusionSafe: r.fusionSafe,
        azimuthBiasDeg: r.spatialBias?.azimuthBiasDeg ?? 0,
        elevationBiasDeg: r.spatialBias?.elevationBiasDeg ?? 0,
        clockOffsetMs: r.clockBias?.offsetMs ?? 0,
      })),
      unresolvedGroups: this.state.unresolvedGroups.map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        parentCueId: g.parentCueId,
        reason: g.reason,
      })),
      fusionModes: Object.fromEntries(this.fusionModePerSensor),
      investigationSummaries: this.getActiveInvestigations(),
      groundTruth: this.getGroundTruth(),
    };
  }

  // ── Investigation Parameters API ─────────────────────────────────────

  getInvestigationParameters(): InvestigationParameters {
    return this.currentParameters;
  }

  setInvestigationParameters(params: Partial<InvestigationParameters>): void {
    if (params.weights) {
      this.currentParameters.weights = { ...this.currentParameters.weights, ...params.weights };
    }
    if (params.thresholds) {
      this.currentParameters.thresholds = { ...this.currentParameters.thresholds, ...params.thresholds };
    }
    if (params.policyMode) {
      this.currentParameters.policyMode = params.policyMode;
    }
  }

  resetInvestigationParameters(): void {
    this.currentParameters = {
      ...DEFAULT_INVESTIGATION_PARAMETERS,
      weights: { ...DEFAULT_INVESTIGATION_PARAMETERS.weights },
      thresholds: { ...DEFAULT_INVESTIGATION_PARAMETERS.thresholds },
    };
  }

  getActiveInvestigations(): InvestigationSummaryWS[] {
    const summaries: InvestigationSummaryWS[] = [];
    // Each active cue represents an active investigation
    for (const cue of this.activeCuesById.values()) {
      const systemTrackId = cue.systemTrackId as string;
      const track = this.state.tracks.find(t => (t.systemTrackId as string) === systemTrackId);
      if (!track) continue;

      // Find assigned sensors (tasks executing for this track)
      const assignedSensors = this.state.tasks
        .filter(t => (t.systemTrackId as string) === systemTrackId && t.status === 'executing')
        .map(t => t.sensorId as string);

      // Count bearings from eoTracks associated with this track
      const bearingCount = this.state.eoTracks
        .filter(et => (et.associatedSystemTrackId as string) === systemTrackId)
        .length;

      // Geometry status
      const geoEstimate = this.state.geometryEstimates.get(systemTrackId);
      let geometryStatus = 'bearing_only';
      if (geoEstimate) {
        geometryStatus = geoEstimate.classification ?? 'candidate_3d';
      }

      // Check for unresolved groups related to this track's cue
      const relatedGroup = [...this.unresolvedGroupsById.values()].find(
        g => (g.parentCueId as string) === (cue.cueId as string),
      );
      let investigationStatus = 'in_progress';
      const hypotheses: Array<{ label: string; probability: number }> = [];
      if (relatedGroup) {
        if (relatedGroup.status === 'active' || relatedGroup.status === 'escalated') {
          investigationStatus = 'split_detected';
          // Generate hypotheses from eoTracks in the group
          const groupTracks = relatedGroup.eoTrackIds.length;
          if (groupTracks > 0) {
            for (let i = 0; i < groupTracks; i++) {
              hypotheses.push({
                label: `Target ${i + 1}`,
                probability: 1 / groupTracks,
              });
            }
          }
        }
      }
      if (track.status === 'confirmed' && bearingCount >= 2 && geoEstimate) {
        investigationStatus = 'confirmed';
      }

      // Score breakdown from the most recent task for this track
      const recentTask = this.state.tasks.find(
        t => (t.systemTrackId as string) === systemTrackId && t.scoreBreakdown,
      );
      const scoreBreakdown = {
        threat: recentTask?.scoreBreakdown?.threat ?? 0,
        uncertainty: recentTask?.scoreBreakdown?.uncertaintyReduction ?? 0,
        geometry: recentTask?.scoreBreakdown?.geometryGain ?? 0,
        intent: recentTask?.scoreBreakdown?.operatorIntent ?? 0,
      };

      summaries.push({
        trackId: systemTrackId,
        trackStatus: track.status,
        investigationStatus,
        assignedSensors,
        cuePriority: cue.priority,
        bearingCount,
        geometryStatus,
        hypotheses,
        scoreBreakdown,
      });
    }
    return summaries;
  }

  forceResolveGroup(groupId: string): boolean {
    const group = this.unresolvedGroupsById.get(groupId);
    if (!group) return false;
    // Mark group as resolved
    const resolved: UnresolvedGroup = {
      ...group,
      status: 'resolved' as UnresolvedGroup['status'],
    };
    this.unresolvedGroupsById.set(groupId, resolved);
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()];
    this.pushEvent('investigation.force_resolved', `Group ${groupId} force-resolved by operator`);
    return true;
  }

  /** Returns formal EventEnvelope objects for use by the validation runner. */
  getEventEnvelopes(): EventEnvelope[] {
    return this.eventEnvelopes;
  }

  start(): void {
    if (this.state.running) return;
    // Determine correct action: 'start' from idle, 'resume' from paused
    const action: SimulationAction = this.stateMachine.currentState === 'idle' ? 'start' : 'resume';
    const result = this.stateMachine.tryTransition(action);
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = true;
    this.scheduleStep();
    this.pushEvent('scenario.started', `Scenario "${this.scenario.name}" started`);
  }

  pause(): void {
    if (!this.state.running) return;
    const result = this.stateMachine.tryTransition('pause');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pushEvent('scenario.paused', 'Scenario paused');
    // Send final broadcast with running=false so frontend knows to stop
    this.broadcastRap(true);
  }

  /**
   * Stop the scenario and return to idle.
   * Unlike pause(), this resets the state machine to idle.
   */
  stop(): void {
    const result = this.stateMachine.tryTransition('stop');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pushEvent('scenario.stopped', 'Scenario stopped');
    this.broadcastRap(true);
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(0.1, Math.min(100, speed));
    // Reschedule with new speed
    if (this.state.running) {
      if (this.timer) clearTimeout(this.timer);
      this.scheduleStep();
    }
    this.pushEvent('scenario.speed_changed', `Speed set to ${this.state.speed}x`);
  }

  reset(scenarioId?: string): void {
    const result = this.stateMachine.tryTransition('reset');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    // Stop the timer without going through pause() state transition
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (scenarioId) {
      const s = getScenarioById(scenarioId);
      if (s) this.scenario = s;
    }
    this.resetInternalState();
    // Complete the reset: resetting → idle
    this.stateMachine.tryTransition('reset');
    this.pushEvent('scenario.reset', 'Scenario reset');
  }

  /**
   * Seek to a specific simulation time (in seconds).
   * Replays the scenario from the start up to the target time,
   * then pauses at that point. Resumes playing if wasRunning.
   */
  seek(toSec: number): void {
    const wasRunning = this.state.running;
    // If running, pause first (state machine: running → paused)
    if (wasRunning) {
      this.pause();
    }
    // Now seek (state machine: paused → seeking)
    const result = this.stateMachine.tryTransition('seek');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }

    // Clamp to valid range
    toSec = Math.max(0, Math.min(toSec, this.scenario.durationSec));

    // Reset all state and replay up to target time
    this.resetInternalState();

    // Fast-forward by stepping 1 second at a time
    for (let t = 0; t < toSec; t++) {
      const result = this.runner.step(1);
      this.state.elapsedSec = result.currentTimeSec;

      // Process all events synchronously (no batching during seek)
      for (const simEvent of result.events) {
        this.processSimEvent(simEvent);
      }

      // Update sensor status
      this.updateSensorStatus(result.activeFaults);
      this.state.tracks = this.trackManager.getAllTracks().filter(tr => tr.status !== 'dropped');
      this.processAccumulatedBearings();
      this.expireStaleEoCues();
      this.computeGeometryEstimates();

      if (result.currentTimeSec - this.lastEoTaskingSec >= EO_TASKING_INTERVAL_SEC) {
        this.runEoTaskingCycle();
        this.lastEoTaskingSec = result.currentTimeSec;
      }
    }

    // Sync Phase 5 state to LiveState
    this.state.eoTracks = [...this.eoTracksById.values()];
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()].filter(g => g.status === 'active');
    this.state.activeCues = [...this.activeCuesById.values()];

    // Complete the seek (state machine: seeking → paused)
    this.stateMachine.tryTransition('seek_complete');

    // Broadcast current state (force: user-initiated seek)
    this.broadcastRap(true);
    this.pushEvent('scenario.seeked', `Seeked to T+${toSec}s`);

    // Resume if was running
    if (wasRunning) {
      this.start();
    }
  }

  // ── Live Injection API ───────────────────────────────────────────────

  /**
   * Inject a fault into the running scenario. Creates a fault_start event
   * immediately and schedules a fault_end after durationSec.
   * Returns the injection ID.
   */
  injectFault(fault: { type: string; sensorId: string; magnitude?: number; durationSec: number }): string {
    const injectionId = generateId();
    const now = this.state.elapsedSec;

    // Log the injection
    this.injectionLog.push({
      id: injectionId,
      type: 'fault',
      timestamp: Date.now(),
      details: { ...fault, simTimeSec: now },
    });

    // Emit fault_start via the normal processing path
    this.processSimEvent({
      type: 'fault_start',
      timeSec: now,
      data: {
        type: fault.type,
        sensorId: fault.sensorId,
        magnitude: fault.magnitude,
        startTime: now,
        endTime: now + fault.durationSec,
      },
    });

    // Schedule fault_end after durationSec (using real time scaled by speed)
    const intervalMs = (fault.durationSec * 1000) / this.state.speed;
    setTimeout(() => {
      if (!this.state.running) return;
      this.processSimEvent({
        type: 'fault_end',
        timeSec: this.state.elapsedSec,
        data: {
          type: fault.type,
          sensorId: fault.sensorId,
          magnitude: fault.magnitude,
          startTime: now,
          endTime: this.state.elapsedSec,
        },
      });
      this.broadcastRap(true);
    }, intervalMs);

    // Broadcast the updated state immediately (force: user-initiated injection)
    this.broadcastRap(true);

    return injectionId;
  }

  /**
   * Inject a pop-up target into the running scenario.
   * Creates a new target entry that will produce observations on subsequent ticks.
   * Returns the target ID.
   */
  injectTarget(target: { lat: number; lon: number; alt: number; speed: number; headingDeg: number; label?: string }): string {
    const targetId = `INJ-${generateId().slice(0, 8)}`;
    const now = this.state.elapsedSec;
    const label = target.label || `Popup-${targetId.slice(4)}`;

    // Log the injection
    this.injectionLog.push({
      id: targetId,
      type: 'target',
      timestamp: Date.now(),
      details: { ...target, targetId, simTimeSec: now },
    });

    // Compute an end position based on speed and heading over remaining scenario time
    const remainingSec = this.state.durationSec - now;
    const speedDegPerSec = target.speed / 111_000; // rough m/s to deg/s
    const headingRad = (target.headingDeg * Math.PI) / 180;
    const endLat = target.lat + speedDegPerSec * remainingSec * Math.cos(headingRad);
    const endLon = target.lon + speedDegPerSec * remainingSec * Math.sin(headingRad);

    // Add target definition to the scenario so the ScenarioRunner picks it up
    // Note: ScenarioRunner reads scenario.targets directly, so we mutate it
    (this.scenario as any).targets.push({
      targetId,
      name: label,
      description: `Injected pop-up target at T+${now}s`,
      startTime: now,
      waypoints: [
        { time: 0, position: { lat: target.lat, lon: target.lon, alt: target.alt } },
        { time: remainingSec, position: { lat: endLat, lon: endLon, alt: target.alt } },
      ],
    });

    this.pushEvent(
      'target.injected',
      `Pop-up target ${label} injected at (${target.lat.toFixed(3)}, ${target.lon.toFixed(3)})`,
      { targetId, lat: target.lat, lon: target.lon, alt: target.alt, speed: target.speed, headingDeg: target.headingDeg },
    );

    return targetId;
  }

  /**
   * Inject an operator action into the running scenario.
   * Routes to existing operator controls (reserve/veto).
   */
  injectOperatorAction(action: { type: string; sensorId?: string; targetId?: string; durationSec?: number }): void {
    const injectionId = generateId();
    const now = this.state.elapsedSec;

    this.injectionLog.push({
      id: injectionId,
      type: 'operator_action',
      timestamp: Date.now(),
      details: { ...action, simTimeSec: now },
    });

    this.processSimEvent({
      type: 'operator_action',
      timeSec: now,
      data: {
        action: action.type,
        sensorId: action.sensorId,
        targetId: action.targetId,
        durationSec: action.durationSec,
      },
    });
  }

  /**
   * Load a custom ScenarioDefinition into the engine and reset to use it.
   */
  loadCustomScenario(def: ScenarioDefinition): void {
    // Use reset transition (handles idle, running, and paused states)
    const result = this.stateMachine.tryTransition('reset');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scenario = def;
    this.resetInternalState();
    // Complete: resetting → idle
    this.stateMachine.tryTransition('reset');
    this.pushEvent('scenario.loaded', `Custom scenario "${def.name}" loaded`);
  }

  private resetInternalState(): void {
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 8 });
    this.registrationService = new RegistrationHealthService();

    // Reset EO state
    this.eoTracksById.clear();
    this.unresolvedGroupsById.clear();
    this.activeCuesById.clear();
    this.cueToTrack.clear();
    this.pendingBearings.clear();
    this.lastEoTaskingSec = 0;
    this.fusionModePerSensor.clear();
    this.eventEnvelopes = [];

    this.state = this.buildInitialState();
  }

  addWsClient(client: WsClient): void {
    this.wsClients.add(client);
  }

  removeWsClient(client: WsClient): void {
    this.wsClients.delete(client);
  }

  // ── Simulation step ──────────────────────────────────────────────────

  private scheduleStep(): void {
    if (!this.state.running) return;
    // 1-second sim steps, scaled by speed
    const intervalMs = 1000 / this.state.speed;
    this.timer = setTimeout(() => {
      this.tick();
      this.scheduleStep();
    }, intervalMs);
  }

  private tick(): void {
    const dtSec = 1; // fixed 1-second simulation step
    const result = this.runner.step(dtSec);
    this.state.elapsedSec = result.currentTimeSec;

    // Process events in batches, yielding to the event loop between batches
    // to prevent blocking I/O when the number of events per tick is large.
    const BATCH_SIZE = 20;
    const events = result.events;

    const processBatch = (startIdx: number): void => {
      const end = Math.min(startIdx + BATCH_SIZE, events.length);
      for (let i = startIdx; i < end; i++) {
        this.processSimEvent(events[i]);
      }

      if (end < events.length) {
        // Yield to the event loop before processing the next batch
        setImmediate(() => processBatch(end));
      } else {
        // All events processed — finalize the tick
        this.finalizeTick(result);
      }
    };

    if (events.length > BATCH_SIZE) {
      processBatch(0);
    } else {
      // Small batch — process synchronously to avoid overhead
      for (const simEvent of events) {
        this.processSimEvent(simEvent);
      }
      this.finalizeTick(result);
    }
  }

  private finalizeTick(result: { currentTimeSec: number; activeFaults: Array<{ sensorId: string; type: string }>; isComplete: boolean }): void {
    // Update sensor online status based on active faults
    this.updateSensorStatus(result.activeFaults);

    // Snapshot tracks from track manager
    this.state.tracks = this.trackManager.getAllTracks().filter(t => t.status !== 'dropped');

    // Phase 5: Process accumulated bearings and run EO tasking
    this.processAccumulatedBearings();
    this.expireStaleEoCues();

    // Phase 6: Compute geometry estimates from EO bearings
    this.computeGeometryEstimates();

    if (result.currentTimeSec - this.lastEoTaskingSec >= EO_TASKING_INTERVAL_SEC) {
      this.runEoTaskingCycle();
      this.lastEoTaskingSec = result.currentTimeSec;
    }

    // Sync Phase 5 state to LiveState
    this.state.eoTracks = [...this.eoTracksById.values()];
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()].filter(g => g.status === 'active');
    this.state.activeCues = [...this.activeCuesById.values()];

    // Continuous gimbal tracking: update EO sensor gimbal azimuth toward current target
    this.updateGimbalPointing();

    // Broadcast updated RAP to WebSocket clients
    this.broadcastRap();

    // Check completion
    if (result.isComplete) {
      this.pause();
      this.pushEvent('scenario.completed', `Scenario completed at T+${result.currentTimeSec}s`);
    }
  }

  private processSimEvent(simEvent: SimulationEvent): void {
    switch (simEvent.type) {
      case 'observation': {
        // RadarObservation wraps SourceObservation in .observation;
        // unwrap if needed so the fusion pipeline gets the right shape.
        const raw = simEvent.data as any;
        const obs: SourceObservation = raw?.observation ?? raw;
        if (!obs || !obs.position) break;

        // Get registration health for this sensor
        const health = this.registrationService.getHealth(obs.sensorId);

        // Phase 7: Select fusion mode based on registration health
        const sensorType = this.state.sensors.find(s => s.sensorId === obs.sensorId)?.sensorType ?? 'radar';
        const fusionDecision = selectFusionMode(health ?? undefined, sensorType, 0.5);
        this.fusionModePerSensor.set(obs.sensorId as string, fusionDecision.mode);

        // Process through track manager (correlate + fuse)
        const tmResult = this.trackManager.processObservation(obs, health ?? undefined);

        // Collect formal event envelopes for validation
        this.eventEnvelopes.push(tmResult.event);
        this.eventEnvelopes.push(tmResult.correlationEvent);

        // Push event to log
        const decision = tmResult.correlationEvent.data.decision;
        const trackId = tmResult.track.systemTrackId;
        this.pushEvent(
          'source.observation.reported',
          `${obs.sensorId} → ${decision === 'new_track' ? 'new' : 'update'} ${trackId}`,
          { sensorId: obs.sensorId, trackId, decision },
        );
        break;
      }

      case 'bearing': {
        // Phase 5: Accumulate bearing for batch processing in finalizeTick
        const bearingObs = simEvent.data as EoBearingObservation;
        if (!bearingObs?.bearing) break;

        const sensorId = bearingObs.sensorId;

        // Try to match bearing to an active cue for this sensor
        const matchedCueId = this.matchBearingToCue(bearingObs);

        if (matchedCueId) {
          // Accumulate for batch processing
          if (!this.pendingBearings.has(matchedCueId)) {
            this.pendingBearings.set(matchedCueId, []);
          }
          this.pendingBearings.get(matchedCueId)!.push(bearingObs);
        }

        this.pushEvent(
          'eo.bearing.measured',
          `${sensorId} bearing az=${bearingObs.bearing.azimuthDeg.toFixed(1)}° → ${matchedCueId ? `cue ${matchedCueId.slice(0, 8)}` : 'unmatched'}`,
          { sensorId, targetId: bearingObs.targetId, cueId: matchedCueId ?? undefined, timeSec: simEvent.timeSec },
        );
        break;
      }

      case 'fault_start': {
        const fault = simEvent.data as Record<string, unknown>;
        const sensorId = (fault?.sensorId ?? '') as string;
        const faultType = (fault?.type ?? '') as string;

        // Update sensor status
        const sensor = this.state.sensors.find(s => s.sensorId === sensorId);
        if (sensor && faultType === 'sensor_outage') {
          sensor.online = false;
        }

        // For bias faults, update registration health
        if (faultType === 'azimuth_bias') {
          const prevHealth = this.registrationService.getHealth(sensorId as SensorId);
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: (fault?.magnitude as number) ?? 2,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
          const newHealth = this.registrationService.getHealth(sensorId as SensorId);
          if (newHealth) {
            this.eventEnvelopes.push({
              ...createEventEnvelope('registration.state.updated', 'live-engine'),
              eventType: 'registration.state.updated',
              data: {
                sensorId: sensorId as SensorId,
                previousState: prevHealth ?? undefined,
                newState: newHealth,
                estimationMethod: 'fault_injection',
                confidence: 1.0,
              },
            } as any);
          }
        }

        this.pushEvent(
          'fault.started',
          `Fault: ${faultType} on ${sensorId}`,
          { sensorId, faultType },
        );
        break;
      }

      case 'fault_end': {
        const fault = simEvent.data as Record<string, unknown>;
        const sensorId = (fault?.sensorId ?? '') as string;
        const faultType = (fault?.type ?? '') as string;

        if (faultType === 'sensor_outage') {
          const sensor = this.state.sensors.find(s => s.sensorId === sensorId);
          if (sensor) sensor.online = true;
        }

        if (faultType === 'azimuth_bias') {
          const prevHealth = this.registrationService.getHealth(sensorId as SensorId);
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: 0,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
          const newHealth = this.registrationService.getHealth(sensorId as SensorId);
          if (newHealth) {
            this.eventEnvelopes.push({
              ...createEventEnvelope('registration.state.updated', 'live-engine'),
              eventType: 'registration.state.updated',
              data: {
                sensorId: sensorId as SensorId,
                previousState: prevHealth ?? undefined,
                newState: newHealth,
                estimationMethod: 'fault_cleared',
                confidence: 1.0,
              },
            } as any);
          }
        }

        this.pushEvent(
          'fault.ended',
          `Fault cleared: ${faultType} on ${sensorId}`,
          { sensorId, faultType },
        );
        break;
      }

      case 'operator_action': {
        const action = simEvent.data as Record<string, unknown>;
        const actionType = (action?.action ?? '') as string;
        this.pushEvent(
          'operator.action',
          `Operator: ${actionType}`,
          action,
        );
        break;
      }
    }
  }

  // ── Phase 5: EO Bearing Processing ────────────────────────────────────

  /**
   * Match an incoming bearing observation to an active EO cue.
   * Returns the cueId if matched, or null.
   */
  private matchBearingToCue(bearingObs: EoBearingObservation): string | null {
    const now = Date.now() as Timestamp;
    for (const [cueId, cue] of this.activeCuesById) {
      if (cue.systemTrackId && bearingObs.sensorId) {
        // Match by sensor: the cue was assigned to a specific sensor via a task
        const task = this.state.tasks.find(
          t => t.cueId === cueId && t.sensorId === bearingObs.sensorId && t.status === 'executing',
        );
        if (task && isCueValid(cue, now)) {
          return cueId;
        }
      }
    }

    // Fallback: match to any valid cue for this sensor
    for (const [cueId, cue] of this.activeCuesById) {
      if (isCueValid(cue, now)) {
        const task = this.state.tasks.find(t => t.cueId === cueId && t.sensorId === bearingObs.sensorId);
        if (task) return cueId;
      }
    }

    return null;
  }

  /**
   * Process all accumulated bearing observations from this tick.
   * For each cue with bearings: create EO tracks, assess ambiguity,
   * trigger split/merge if needed, and generate EO reports.
   */
  private processAccumulatedBearings(): void {
    for (const [cueId, bearings] of this.pendingBearings) {
      const cue = this.activeCuesById.get(cueId);
      if (!cue) continue;

      const systemTrackId = this.cueToTrack.get(cueId);

      // Create EO tracks from bearings
      const newEoTracks: EoTrack[] = [];
      for (const bearingObs of bearings) {
        const eoTrack = this.createEoTrack(bearingObs, cueId as CueId);
        newEoTracks.push(eoTrack);
      }

      if (newEoTracks.length === 0) continue;

      // Collect all EO tracks for this cue (existing + new)
      const cueEoTracks = [
        ...newEoTracks,
        ...[...this.eoTracksById.values()].filter(
          t => t.parentCueId === cueId && !newEoTracks.some(n => n.eoTrackId === t.eoTrackId),
        ),
      ];

      // Assess ambiguity
      const assessment = assessAmbiguity(cueEoTracks, cueId as CueId);

      switch (assessment.type) {
        case 'clear': {
          // Single target confirmed — generate EO report
          const eoTrack = cueEoTracks[0];
          if (eoTrack && systemTrackId) {
            const idResult = assessIdentification(eoTrack.bearing, eoTrack.imageQuality);
            eoTrack.identificationSupport = idResult;
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: eoTrack.sensorId,
              outcome: 'confirmed',
              bearing: eoTrack.bearing,
              imageQuality: eoTrack.imageQuality,
              targetCountEstimate: 1,
              identificationSupport: idResult,
              timestamp: Date.now() as Timestamp,
            });

            // Apply report to system track
            handleEoReport(report, this.trackManager, systemTrackId);

            this.pushEvent(
              'eo.report.received',
              `EO confirmed track ${systemTrackId.slice(0, 8)} via ${eoTrack.sensorId}`,
              { cueId, systemTrackId, outcome: 'confirmed', sensorId: eoTrack.sensorId },
            );
          }
          break;
        }

        case 'crowded': {
          // Multiple confirmed targets — report split_detected
          if (systemTrackId) {
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: cueEoTracks[0].sensorId,
              outcome: 'split_detected',
              targetCountEstimate: cueEoTracks.length,
              timestamp: Date.now() as Timestamp,
            });

            handleEoReport(report, this.trackManager, systemTrackId);

            // Create unresolved group
            const mergeResult = mergeIntoGroup(
              cueEoTracks,
              `Multiple targets (${cueEoTracks.length}) detected in cue response`,
              cueId as CueId,
            );

            // Store group
            this.unresolvedGroupsById.set(mergeResult.mergedGroup.groupId, mergeResult.mergedGroup);
            for (const t of mergeResult.mergedTracks) {
              this.eoTracksById.set(t.eoTrackId, t);
            }

            // Emit formal event for validation
            this.eventEnvelopes.push({
              ...createEventEnvelope('eo.group.created', 'live-engine', 'eo-investigation'),
              eventType: 'eo.group.created',
              data: { group: mergeResult.mergedGroup },
            } as any);

            this.pushEvent(
              'eo.group.created',
              `Unresolved group ${mergeResult.mergedGroup.groupId.slice(0, 8)} — ${cueEoTracks.length} targets for track ${systemTrackId.slice(0, 8)}`,
              {
                groupId: mergeResult.mergedGroup.groupId,
                eoTrackCount: cueEoTracks.length,
                systemTrackId,
              },
            );
          }
          break;
        }

        case 'unresolved': {
          // Ambiguous — create unresolved group
          if (systemTrackId) {
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: cueEoTracks[0].sensorId,
              outcome: 'split_detected',
              targetCountEstimate: cueEoTracks.length,
              timestamp: Date.now() as Timestamp,
            });

            handleEoReport(report, this.trackManager, systemTrackId);

            const mergeResult = mergeIntoGroup(
              cueEoTracks,
              `Ambiguous detection (${cueEoTracks.length} tracks, mixed confidence)`,
              cueId as CueId,
            );

            this.unresolvedGroupsById.set(mergeResult.mergedGroup.groupId, mergeResult.mergedGroup);
            for (const t of mergeResult.mergedTracks) {
              this.eoTracksById.set(t.eoTrackId, t);
            }

            // Emit formal event for validation
            this.eventEnvelopes.push({
              ...createEventEnvelope('eo.group.created', 'live-engine', 'eo-investigation'),
              eventType: 'eo.group.created',
              data: { group: mergeResult.mergedGroup },
            } as any);

            this.pushEvent(
              'eo.group.created',
              `Unresolved group ${mergeResult.mergedGroup.groupId.slice(0, 8)} — ambiguous ${cueEoTracks.length} tracks`,
              {
                groupId: mergeResult.mergedGroup.groupId,
                eoTrackCount: cueEoTracks.length,
                systemTrackId,
              },
            );
          }
          break;
        }
      }
    }

    // Clear pending bearings for this tick
    this.pendingBearings.clear();
  }

  /**
   * Create an EoTrack from a bearing observation.
   */
  private createEoTrack(bearingObs: EoBearingObservation, cueId: CueId): EoTrack {
    const eoTrackId = generateId() as EoTrackId;
    const now = Date.now() as Timestamp;

    const eoTrack: EoTrack = {
      eoTrackId,
      parentCueId: cueId,
      sensorId: bearingObs.sensorId as SensorId,
      bearing: bearingObs.bearing,
      imageQuality: bearingObs.imageQuality,
      identificationSupport: undefined,
      status: 'tentative',
      lineage: [
        createLineageEntry('eo.track.created', `From bearing az=${bearingObs.bearing.azimuthDeg.toFixed(1)}°`),
      ],
      associatedSystemTrackId: (this.cueToTrack.get(cueId) ?? undefined) as SystemTrackId | undefined,
      confidence: 0.5,
      lastUpdated: now,
    };

    this.eoTracksById.set(eoTrackId, eoTrack);

    this.pushEvent(
      'eo.track.created',
      `EO track ${eoTrackId.slice(0, 8)} from ${bearingObs.sensorId} az=${bearingObs.bearing.azimuthDeg.toFixed(1)}°`,
      { eoTrackId, sensorId: bearingObs.sensorId, cueId },
    );

    return eoTrack;
  }

  // ── Phase 5: EO Tasking Cycle ─────────────────────────────────────────

  /**
   * Run a full EO tasking cycle:
   * 1. Generate candidates (track × sensor pairs)
   * 2. Score each candidate (including group-aware boosting)
   * 3. Apply policy (auto_with_veto)
   * 4. Assign tasks (greedy, one per sensor)
   * 5. Issue cues for assigned tasks
   */
  private runEoTaskingCycle(): void {
    const tracks = this.state.tracks;
    const sensors = this.state.sensors;

    // 1. Generate candidates
    const candidates = generateCandidates(tracks, sensors);
    if (candidates.length === 0) return;

    // 2. Score each candidate
    // Tracks with unresolved groups get a boost via operator-interest set
    const groupBoostedTrackIds = new Set<string>(this.operatorPriorityTracks);
    for (const group of this.unresolvedGroupsById.values()) {
      if (group.status !== 'active') continue;
      const systemTrackId = this.cueToTrack.get(group.parentCueId);
      if (systemTrackId) groupBoostedTrackIds.add(systemTrackId);
    }

    // Compute sensor occupancy from active tasks
    const sensorOccupancy = new Map<string, number>();
    for (const task of this.state.tasks) {
      if (task.status === 'executing') {
        sensorOccupancy.set(task.sensorId as string, (sensorOccupancy.get(task.sensorId as string) ?? 0) + 1);
      }
    }

    const scoredDecisions = candidates.map(candidate => {
      const score = scoreCandidate(candidate, this.currentParameters.weights as ScoringWeights, groupBoostedTrackIds, sensorOccupancy);
      return { candidate, score };
    });

    // 3. Apply policy
    const decisions = applyPolicy(
      scoredDecisions.map(sd => ({
        candidate: sd.candidate,
        score: sd.score,
        approved: true,
        reason: 'auto',
      })),
      this.currentParameters.policyMode,
      [],
    );

    // 4. Assign tasks
    const assignments = assignTasks(decisions, this.currentParameters.policyMode);

    // 5. Issue cues and create tasks for each assignment
    for (const assignment of assignments) {
      const track = tracks.find(t => t.systemTrackId === assignment.systemTrackId);
      const sensor = sensors.find(s => s.sensorId === assignment.sensorId);
      if (!track || !sensor) continue;

      // Skip if track already has a pending/active cue
      const hasActiveCue = [...this.cueToTrack.entries()].some(
        ([cueId, trackId]) => trackId === assignment.systemTrackId && this.activeCuesById.has(cueId),
      );
      if (hasActiveCue) continue;

      // Get registration health for sensor
      const health = this.registrationService.getHealth(sensor.sensorId);
      const qualityLevel = health?.spatialQuality ?? 'good';

      // Issue cue
      const cue = issueCue(track, sensor, qualityLevel);

      // Store cue
      this.activeCuesById.set(cue.cueId, cue);
      this.cueToTrack.set(cue.cueId, track.systemTrackId as string);

      // Mark track as under EO investigation
      this.trackManager.setEoInvestigationStatus(track.systemTrackId, 'in_progress');

      // Create task record
      const task: Task = {
        taskId: assignment.taskId,
        cueId: cue.cueId,
        sensorId: assignment.sensorId,
        systemTrackId: assignment.systemTrackId,
        status: 'executing',
        scoreBreakdown: assignment.scoreBreakdown,
        policyMode: this.currentParameters.policyMode,
        operatorOverride: undefined,
        createdAt: Date.now() as Timestamp,
        completedAt: undefined,
      };
      this.state.tasks.push(task);

      // Update sensor gimbal pointing
      if (sensor.gimbal) {
        sensor.gimbal.azimuthDeg = bearingDeg(
          sensor.position.lat, sensor.position.lon,
          track.state.lat, track.state.lon,
        );
        sensor.gimbal.currentTargetId = track.systemTrackId;
      }

      // Emit formal TaskDecided event for validation
      this.eventEnvelopes.push({
        ...createEventEnvelope('task.decided', 'live-engine', 'eo-tasking'),
        eventType: 'task.decided',
        data: {
          taskId: assignment.taskId,
          sensorId: assignment.sensorId,
          systemTrackId: assignment.systemTrackId,
          scoreBreakdown: assignment.scoreBreakdown,
          mode: this.currentParameters.policyMode,
          operatorOverride: undefined,
        },
      } as any);

      this.pushEvent(
        'eo.cue.issued',
        `Cue ${cue.cueId.slice(0, 8)} → ${sensor.sensorId} for track ${track.systemTrackId.slice(0, 8)} (priority ${cue.priority})`,
        {
          cueId: cue.cueId,
          sensorId: sensor.sensorId,
          systemTrackId: track.systemTrackId,
          priority: cue.priority,
          uncertaintyGateDeg: cue.uncertaintyGateDeg,
        },
      );
    }

    // Keep task list manageable — remove completed tasks older than 60s
    const cutoff = Date.now() - 60_000;
    this.state.tasks = this.state.tasks.filter(
      t => t.status === 'executing' || t.status === 'proposed' || (t.completedAt ?? Date.now()) > cutoff,
    );
  }

  /**
   * Remove expired cues and mark their tasks as completed or expired.
   */
  private expireStaleEoCues(): void {
    const now = Date.now() as Timestamp;
    for (const [cueId, cue] of this.activeCuesById) {
      if (!isCueValid(cue, now)) {
        this.activeCuesById.delete(cueId);

        // Find and complete the associated task
        const task = this.state.tasks.find(t => t.cueId === cueId && t.status === 'executing');
        if (task) {
          task.status = 'completed';
          task.completedAt = now;
        }

        // If the track's investigation is still in_progress, mark as no_support
        const systemTrackId = this.cueToTrack.get(cueId);
        if (systemTrackId) {
          const track = this.trackManager.getTrack(systemTrackId as SystemTrackId);
          if (track && track.eoInvestigationStatus === 'in_progress') {
            // Only mark no_support if no bearings were received for this cue
            const hasEoTracks = [...this.eoTracksById.values()].some(t => t.parentCueId === cueId);
            if (!hasEoTracks) {
              this.trackManager.setEoInvestigationStatus(systemTrackId as SystemTrackId, 'no_support');
              this.pushEvent(
                'eo.report.received',
                `No EO support for track ${systemTrackId.slice(0, 8)} — cue expired`,
                { cueId, systemTrackId, outcome: 'no_support' },
              );
            }
          }
        }

        this.cueToTrack.delete(cueId);
      }
    }
  }

  // ── Phase 6: Geometry Computation ────────────────────────────────────

  /**
   * Compute triangulation geometry estimates for tracks with ≥2 EO bearings
   * from different sensors. Stores results in geometryEstimates Map.
   */
  private computeGeometryEstimates(): void {
    // Group EO tracks by associated system track
    const bearingsByTrack = new Map<string, EoTrack[]>();
    for (const eoTrack of this.eoTracksById.values()) {
      const trackId = eoTrack.associatedSystemTrackId;
      if (!trackId || !eoTrack.bearing) continue;
      if (!bearingsByTrack.has(trackId)) {
        bearingsByTrack.set(trackId, []);
      }
      bearingsByTrack.get(trackId)!.push(eoTrack);
    }

    for (const [systemTrackId, eoTracks] of bearingsByTrack) {
      // Need bearings from ≥2 different sensors
      const uniqueSensors = new Set(eoTracks.map(t => t.sensorId as string));
      if (uniqueSensors.size < 2) continue;

      // Pick the best (most recent) bearing per sensor
      const bestPerSensor = new Map<string, EoTrack>();
      for (const t of eoTracks) {
        const existing = bestPerSensor.get(t.sensorId as string);
        if (!existing || t.bearing.timestamp > existing.bearing.timestamp) {
          bestPerSensor.set(t.sensorId as string, t);
        }
      }
      const selectedTracks = [...bestPerSensor.values()];
      if (selectedTracks.length < 2) continue;

      // Get sensor positions
      const sensorPositions = selectedTracks.map(t => {
        const sensor = this.state.sensors.find(s => s.sensorId === t.sensorId);
        return sensor?.position ?? { lat: 0, lon: 0, alt: 0 };
      });
      const bearings = selectedTracks.map(t => t.bearing);

      try {
        const triResult = triangulateMultiple(sensorPositions, bearings);
        const estimate = buildGeometryEstimate(
          triResult,
          selectedTracks.map(t => t.eoTrackId),
          0.5, // assumed bearing noise deg
          Math.abs(bearings[0].timestamp - bearings[bearings.length - 1].timestamp),
        );

        this.state.geometryEstimates.set(systemTrackId, estimate);

        // Emit formal GeometryEstimateUpdated event for validation
        this.eventEnvelopes.push({
          ...createEventEnvelope('geometry.estimate.updated', 'live-engine', 'geometry'),
          eventType: 'geometry.estimate.updated',
          data: {
            estimateId: estimate.estimateId,
            eoTrackIds: estimate.eoTrackIds,
            classification: estimate.classification,
            quality: estimate.quality,
            position3D: estimate.position3D,
            covariance3D: estimate.covariance3D,
          },
        } as any);

        this.pushEvent(
          'geometry.estimate.updated',
          `Geometry ${estimate.classification} for track ${systemTrackId.slice(0, 8)} (${estimate.quality}, ${estimate.intersectionAngleDeg.toFixed(1)}°)`,
          {
            systemTrackId,
            classification: estimate.classification,
            quality: estimate.quality,
            intersectionAngleDeg: estimate.intersectionAngleDeg,
            numBearings: triResult.numBearings,
          },
        );
      } catch {
        // Triangulation can fail with degenerate geometry — skip
      }
    }
  }

  // ── Track Dossier Methods ────────────────────────────────────────────

  /**
   * Collect evidence chain for a track: contributing sensors, observation
   * count, correlation decisions, and last 20 source observations from the
   * event log.
   */
  getTrackEvidence(trackId: string): Record<string, unknown> {
    const track = this.trackManager.getTrack(trackId as SystemTrackId);
    if (!track) return { contributingSensors: [], observationCount: 0, correlationDecisions: [], sourceObservations: [] };

    const contributingSensors = track.sources.map(sid => {
      const sensor = this.state.sensors.find(s => s.sensorId === sid);
      return {
        sensorId: sid,
        sensorType: sensor?.sensorType ?? 'unknown',
        online: sensor?.online ?? false,
      };
    });

    const trackEvents = this.state.eventLog.filter(
      e => e.data && (e.data as any).trackId === trackId,
    );
    const observationCount = trackEvents.filter(
      e => e.eventType === 'source.observation.reported',
    ).length;

    const correlationDecisions = trackEvents
      .filter(e => e.eventType === 'source.observation.reported')
      .slice(-20)
      .map(e => ({
        timestamp: e.timestamp,
        simTimeSec: e.simTimeSec,
        sensorId: (e.data as any)?.sensorId ?? '',
        decision: (e.data as any)?.decision ?? '',
      }));

    const sourceObservations = track.lineage.slice(-20).map(entry => ({
      version: entry.version,
      timestamp: entry.timestamp,
      event: entry.event,
      description: entry.description,
    }));

    return {
      contributingSensors,
      observationCount,
      correlationDecisions,
      sourceObservations,
    };
  }

  /**
   * Collect investigation history for a track: active cues, EO tracks/bearings,
   * EO reports, identification support, and unresolved groups.
   */
  getTrackInvestigation(trackId: string): Record<string, unknown> {
    const activeCues: Array<Record<string, unknown>> = [];
    for (const [cueId, sysTrackId] of this.cueToTrack) {
      if (sysTrackId !== trackId) continue;
      const cue = this.activeCuesById.get(cueId);
      if (!cue) continue;
      const task = this.state.tasks.find(t => t.cueId === cueId);
      activeCues.push({
        cueId,
        sensorId: task?.sensorId ?? null,
        priority: cue.priority,
        uncertaintyGateDeg: cue.uncertaintyGateDeg,
        validFrom: cue.validFrom,
        validTo: cue.validTo,
        taskStatus: task?.status ?? null,
      });
    }

    const eoTracks = [...this.eoTracksById.values()]
      .filter(t => t.associatedSystemTrackId === trackId)
      .map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        confidence: t.confidence,
        identificationSupport: t.identificationSupport ?? null,
      }));

    const eoReports = this.state.eventLog
      .filter(
        e =>
          e.eventType === 'eo.report.received' &&
          e.data &&
          (e.data as any).systemTrackId === trackId,
      )
      .slice(-20)
      .map(e => ({
        timestamp: e.timestamp,
        simTimeSec: e.simTimeSec,
        outcome: (e.data as any)?.outcome ?? '',
        sensorId: (e.data as any)?.sensorId ?? '',
        cueId: (e.data as any)?.cueId ?? '',
      }));

    const identifications = [...this.eoTracksById.values()]
      .filter(t => t.associatedSystemTrackId === trackId && t.identificationSupport)
      .map(t => ({
        sensorId: t.sensorId,
        type: t.identificationSupport!.type,
        confidence: t.identificationSupport!.confidence,
        features: t.identificationSupport!.features,
      }));

    const trackEoTrackIds = new Set(
      [...this.eoTracksById.values()]
        .filter(t => t.associatedSystemTrackId === trackId)
        .map(t => t.eoTrackId as string),
    );
    const unresolvedGroups = [...this.unresolvedGroupsById.values()]
      .filter(g => g.status === 'active' && g.eoTrackIds.some(id => trackEoTrackIds.has(id as string)))
      .map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        reason: g.reason,
        memberCount: g.eoTrackIds.length,
        escalated: g.escalated ?? false,
      }));

    return {
      activeCues,
      eoTracks,
      eoReports,
      identifications,
      unresolvedGroups,
    };
  }

  /**
   * Compute a threat assessment for a track: score breakdown, kinematic
   * profile, closure rate, and tasking priority.
   */
  getTrackThreat(trackId: string): Record<string, unknown> {
    const track = this.trackManager.getTrack(trackId as SystemTrackId);
    if (!track) {
      return {
        threatScore: 0,
        scoreBreakdown: null,
        kinematicProfile: null,
        closureRate: null,
        taskingPriority: 'none',
      };
    }

    const tasks = this.state.tasks.filter(t => (t.systemTrackId as string) === trackId);
    const activeTask = tasks.find(t => t.status === 'executing');
    const proposedTask = tasks.find(t => t.status === 'proposed');

    const taskForScore = activeTask ?? proposedTask ?? tasks[tasks.length - 1];
    const scoreBreakdown = taskForScore?.scoreBreakdown ?? {
      threatScore: 0,
      uncertaintyReduction: 0,
      geometryGain: 0,
      operatorIntent: 0,
      slewCost: 0,
      occupancyCost: 0,
      total: 0,
    };

    const speed = track.velocity
      ? Math.sqrt(track.velocity.vx ** 2 + track.velocity.vy ** 2 + track.velocity.vz ** 2)
      : 0;
    const altitudeRate = track.velocity?.vz ?? 0;
    const headingRateDegPerSec = 0;

    const speedTrend: 'increasing' | 'decreasing' | 'steady' =
      speed > 250 ? 'increasing' : speed < 50 ? 'decreasing' : 'steady';
    const altitudeTrend: 'climbing' | 'descending' | 'level' =
      altitudeRate > 5 ? 'climbing' : altitudeRate < -5 ? 'descending' : 'level';

    let closureRate = 0;
    let closureSensorId: string | null = null;
    for (const sensor of this.state.sensors) {
      if (!track.velocity) break;
      const dlat = track.state.lat - sensor.position.lat;
      const dlon = track.state.lon - sensor.position.lon;
      const dist = Math.sqrt(dlat ** 2 + dlon ** 2);
      if (dist < 1e-9) continue;

      const ux = dlon / dist;
      const uy = dlat / dist;
      const vr = track.velocity.vx * ux + track.velocity.vy * uy;
      if (closureSensorId === null || Math.abs(vr) > Math.abs(closureRate)) {
        closureRate = -vr;
        closureSensorId = sensor.sensorId as string;
      }
    }

    const taskingPriority = activeTask
      ? 'active'
      : proposedTask
        ? 'proposed'
        : 'none';

    return {
      threatScore: scoreBreakdown.total,
      scoreBreakdown: {
        threat: scoreBreakdown.threatScore,
        uncertainty: scoreBreakdown.uncertaintyReduction,
        geometry: scoreBreakdown.geometryGain,
        intent: scoreBreakdown.operatorIntent,
        slewCost: scoreBreakdown.slewCost,
        occupancyCost: scoreBreakdown.occupancyCost,
      },
      kinematicProfile: {
        speedMs: speed,
        speedTrend,
        altitudeM: track.state.alt,
        altitudeTrend,
        altitudeRateMs: altitudeRate,
        headingRateDegPerSec,
      },
      closureRate: {
        valueMs: closureRate,
        approaching: closureRate > 0,
        sensorId: closureSensorId,
      },
      taskingPriority,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private buildInitialState(): LiveState {
    return {
      tracks: [],
      sensors: this.buildSensorStates(),
      tasks: [],
      geometryEstimates: new Map(),
      registrationStates: [],
      eventLog: [],
      scenarioId: this.scenario.id,
      running: false,
      speed: 1,
      elapsedSec: 0,
      durationSec: this.scenario.durationSec,
      eoTracks: [],
      unresolvedGroups: [],
      activeCues: [],
    };
  }

  private buildSensorStates(): SensorState[] {
    return this.scenario.sensors.map(s => ({
      sensorId: s.sensorId as SensorId,
      sensorType: s.type as 'radar' | 'eo' | 'c4isr',
      position: { ...s.position },
      gimbal: s.type === 'eo' ? {
        azimuthDeg: 0,
        elevationDeg: 0,
        slewRateDegPerSec: s.slewRateDegPerSec ?? 30,
        currentTargetId: undefined,
      } : undefined,
      fov: s.fov ? { halfAngleHDeg: s.fov.halfAngleHDeg, halfAngleVDeg: s.fov.halfAngleVDeg } : undefined,
      coverage: { ...s.coverage },
      online: true,
      lastUpdateTime: Date.now() as Timestamp,
    }));
  }

  private updateSensorStatus(activeFaults: Array<{ sensorId: string; type: string }>): void {
    for (const sensor of this.state.sensors) {
      const hasOutage = activeFaults.some(
        f => f.sensorId === sensor.sensorId && f.type === 'sensor_outage',
      );
      sensor.online = !hasOutage;
      sensor.lastUpdateTime = Date.now() as Timestamp;
    }
  }

  /** Add a track to the operator priority set (boosts EO tasking score). */
  addPriorityTrack(trackId: string): void {
    this.operatorPriorityTracks.add(trackId);
  }

  /** Remove a track from the operator priority set. */
  removePriorityTrack(trackId: string): void {
    this.operatorPriorityTracks.delete(trackId);
  }

  /** Get all operator-prioritized track IDs. */
  getPriorityTracks(): string[] {
    return [...this.operatorPriorityTracks];
  }

  /** Classify a track by setting its classification, source, and confidence. */
  classifyTrack(
    trackId: string,
    classification: TargetClassification,
    source: ClassificationSource,
    confidence: number = 1.0,
  ): SystemTrack | undefined {
    const track = this.state.tracks.find(
      t => t.systemTrackId === trackId,
    );
    if (!track) return undefined;
    track.classification = classification;
    track.classificationSource = source;
    track.classificationConfidence = Math.max(0, Math.min(1, confidence));
    return track;
  }

  /** Update EO gimbal azimuth to continuously track assigned targets. */
  private updateGimbalPointing(): void {
    const trackMap = new Map(this.state.tracks.map(t => [t.systemTrackId, t]));
    for (const sensor of this.state.sensors) {
      if (!sensor.gimbal || !sensor.gimbal.currentTargetId || !sensor.online) continue;
      const track = trackMap.get(sensor.gimbal.currentTargetId as string);
      if (!track || track.status === 'dropped') {
        // Target lost — clear assignment
        sensor.gimbal.currentTargetId = undefined;
        continue;
      }
      sensor.gimbal.azimuthDeg = bearingDeg(
        sensor.position.lat, sensor.position.lon,
        track.state.lat, track.state.lon,
      );
    }
  }

  private getAllRegistrationStates(): RegistrationState[] {
    const states: RegistrationState[] = [];
    for (const sensor of this.state.sensors) {
      const health = this.registrationService.getHealth(sensor.sensorId);
      if (health) states.push(health);
    }
    return states;
  }

  private pushEvent(eventType: string, summary: string, data?: Record<string, unknown>): void {
    const event: LiveEvent = {
      id: generateId(),
      eventType,
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      summary,
      data,
    };

    // Keep last 500 events
    this.state.eventLog.push(event);
    if (this.state.eventLog.length > 500) {
      this.state.eventLog = this.state.eventLog.slice(-500);
    }

    // Broadcast to WebSocket clients
    this.broadcast({
      type: 'event',
      eventType: event.eventType,
      timestamp: event.timestamp,
      simTimeSec: event.simTimeSec,
      summary: event.summary,
      data: event.data,
    });
  }

  private broadcastRap(force = false): void {
    // Throttle: at high speeds, cap broadcasts to ~4/sec (250ms interval)
    const now = Date.now();
    if (!force && this.state.speed > 2 && (now - this.lastBroadcastTime) < LiveEngine.MIN_BROADCAST_INTERVAL_MS) {
      return;
    }
    this.lastBroadcastTime = now;

    const tracks = this.state.tracks;
    // Strip lineage from broadcast to reduce WS payload size
    // (lineage can grow to hundreds of entries per track)
    const lightTracks = tracks.map(t => ({
      ...t,
      lineage: t.lineage.length > 3 ? t.lineage.slice(-3) : t.lineage,
    }));
    // Prepare lightweight active cues (strip covariance for payload size)
    const lightCues = this.state.activeCues.map(c => ({
      cueId: c.cueId,
      systemTrackId: c.systemTrackId,
      predictedState: c.predictedState,
      uncertaintyGateDeg: c.uncertaintyGateDeg,
      priority: c.priority,
      validFrom: c.validFrom,
      validTo: c.validTo,
    }));

    // Lightweight tasks — only active/recent ones
    const lightTasks = this.state.tasks
      .filter(t => t.status === 'executing' || t.status === 'proposed')
      .map(t => ({
        taskId: t.taskId,
        cueId: t.cueId,
        sensorId: t.sensorId,
        systemTrackId: t.systemTrackId,
        status: t.status,
        scoreBreakdown: t.scoreBreakdown,
        policyMode: t.policyMode,
        createdAt: t.createdAt,
      }));

    this.broadcast({
      type: 'rap.update',
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      running: this.state.running,
      speed: this.state.speed,
      trackCount: tracks.length,
      confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: tracks.filter(t => t.status === 'tentative').length,
      tracks: lightTracks,
      sensors: this.state.sensors,
      activeCues: lightCues,
      tasks: lightTasks,
      // Recent EO bearing observations (from EO tracks created this cycle)
      eoTracks: this.state.eoTracks.slice(-20).map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        associatedSystemTrackId: t.associatedSystemTrackId,
        identificationSupport: t.identificationSupport,
      })),
      // Phase 6: Geometry estimates
      geometryEstimates: [...this.state.geometryEstimates.entries()].map(([trackId, est]) => ({
        trackId,
        estimateId: est.estimateId,
        position3D: est.position3D,
        quality: est.quality,
        classification: est.classification,
        intersectionAngleDeg: est.intersectionAngleDeg,
        timeAlignmentQualityMs: est.timeAlignmentQualityMs,
        bearingNoiseDeg: est.bearingNoiseDeg,
        eoTrackIds: est.eoTrackIds,
      })),
      // Phase 2/7: Registration states
      registrationStates: this.state.registrationStates.map(r => ({
        sensorId: r.sensorId,
        spatialQuality: r.spatialQuality,
        timingQuality: r.timingQuality,
        fusionSafe: r.fusionSafe,
        azimuthBiasDeg: r.spatialBias?.azimuthBiasDeg ?? 0,
        elevationBiasDeg: r.spatialBias?.elevationBiasDeg ?? 0,
        clockOffsetMs: r.clockBias?.offsetMs ?? 0,
      })),
      // Phase 5: Unresolved groups
      unresolvedGroups: this.state.unresolvedGroups.map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        parentCueId: g.parentCueId,
        reason: g.reason,
      })),
      // Phase 7: Fusion modes per sensor
      fusionModes: Object.fromEntries(this.fusionModePerSensor),
      // Investigation summaries for InvestigationManagerPanel
      investigationSummaries: this.getActiveInvestigations(),
    });

    // Separate ground truth broadcast
    const groundTruthTargets = this.getGroundTruth();
    if (groundTruthTargets.length > 0) {
      this.broadcast({
        type: 'groundTruth.update',
        timestamp: Date.now(),
        simTimeSec: this.state.elapsedSec,
        targets: groundTruthTargets,
      });
    }
  }

  private broadcast(msg: Record<string, unknown>): void {
    const json = JSON.stringify(msg);
    for (const client of this.wsClients) {
      try {
        client.send(json);
      } catch {
        this.wsClients.delete(client);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const engine = new LiveEngine();
