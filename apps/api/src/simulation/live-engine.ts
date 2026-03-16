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
} from '@eloc2/domain';
import { createLineageEntry } from '@eloc2/domain';
import type { EventEnvelope } from '@eloc2/events';
import { ScenarioRunner } from '@eloc2/simulator';
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
  private timer: ReturnType<typeof setInterval> | null = null;
  private wsClients = new Set<WsClient>();

  // Phase 5: EO orchestration internal state
  private eoTracksById = new Map<string, EoTrack>();
  private unresolvedGroupsById = new Map<string, UnresolvedGroup>();
  private activeCuesById = new Map<string, EoCue>();
  /** Maps cueId → systemTrackId for cue-to-track lookup. */
  private cueToTrack = new Map<string, string>();
  /** Accumulates bearings per cueId within a tick for batch processing. */
  private pendingBearings = new Map<string, EoBearingObservation[]>();
  private lastEoTaskingSec = 0;

  constructor(scenarioId?: string) {
    this.scenario = (scenarioId ? getScenarioById(scenarioId) : undefined) ?? centralIsrael;
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 8 });
    this.registrationService = new RegistrationHealthService();

    this.state = this.buildInitialState();
  }

  // ── Public API ────────────────────────────────────────────────────────

  getState(): LiveState {
    return this.state;
  }

  start(): void {
    if (this.state.running) return;
    this.state.running = true;
    this.scheduleStep();
    this.pushEvent('scenario.started', `Scenario "${this.scenario.name}" started`);
  }

  pause(): void {
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pushEvent('scenario.paused', 'Scenario paused');
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
    this.pause();
    if (scenarioId) {
      const s = getScenarioById(scenarioId);
      if (s) this.scenario = s;
    }
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

    this.state = this.buildInitialState();
    this.pushEvent('scenario.reset', 'Scenario reset');
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

    if (result.currentTimeSec - this.lastEoTaskingSec >= EO_TASKING_INTERVAL_SEC) {
      this.runEoTaskingCycle();
      this.lastEoTaskingSec = result.currentTimeSec;
    }

    // Sync Phase 5 state to LiveState
    this.state.eoTracks = [...this.eoTracksById.values()];
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()].filter(g => g.status === 'active');
    this.state.activeCues = [...this.activeCuesById.values()];

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
        const obs = simEvent.data as SourceObservation;
        if (!obs || !obs.position) break;

        // Get registration health for this sensor
        const health = this.registrationService.getHealth(obs.sensorId);

        // Process through track manager (correlate + fuse)
        const tmResult = this.trackManager.processObservation(obs, health ?? undefined);

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
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: (fault?.magnitude as number) ?? 2,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
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
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: 0,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
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
    const groupBoostedTrackIds = new Set<string>();
    for (const group of this.unresolvedGroupsById.values()) {
      if (group.status !== 'active') continue;
      // Find the system track associated with this group's cue
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
      const score = scoreCandidate(candidate, undefined, groupBoostedTrackIds, sensorOccupancy);
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
      'auto_with_veto',
      [],
    );

    // 4. Assign tasks
    const assignments = assignTasks(decisions, 'auto_with_veto');

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
        policyMode: 'auto_with_veto',
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

  private broadcastRap(): void {
    const tracks = this.state.tracks;
    this.broadcast({
      type: 'rap.update',
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      running: this.state.running,
      trackCount: tracks.length,
      confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: tracks.filter(t => t.status === 'tentative').length,
      tracks,
      sensors: this.state.sensors,
    });
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
