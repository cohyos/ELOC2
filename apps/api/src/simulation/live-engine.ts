/**
 * Live simulation engine.
 *
 * Wires the ScenarioRunner (synthetic sensor data) through the full
 * processing pipeline: registration, fusion, track management, and
 * geometry. Maintains the authoritative system state that all API
 * endpoints read from, and pushes events to WebSocket clients.
 */

import type {
  SystemTrack,
  SensorState,
  SensorId,
  Task,
  TaskId,
  CueId,
  SystemTrackId,
  Timestamp,
  SourceObservation,
  GeometryEstimate,
  RegistrationState,
} from '@eloc2/domain';
import type { EventEnvelope } from '@eloc2/events';
import { ScenarioRunner } from '@eloc2/simulator';
import type { SimulationEvent } from '@eloc2/simulator';
import { centralIsrael, getScenarioById } from '@eloc2/scenario-library';
import type { ScenarioDefinition } from '@eloc2/scenario-library';
import { TrackManager } from '@eloc2/fusion-core';
import { RegistrationHealthService } from '@eloc2/registration';
import { generateId } from '@eloc2/shared-utils';

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

  constructor(scenarioId?: string) {
    this.scenario = (scenarioId ? getScenarioById(scenarioId) : undefined) ?? centralIsrael;
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 8 });
    this.registrationService = new RegistrationHealthService();

    this.state = {
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
    };
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
    this.state = {
      tracks: [],
      sensors: this.buildSensorStates(),
      tasks: [],
      geometryEstimates: new Map(),
      registrationStates: [],
      eventLog: [],
      scenarioId: this.scenario.id,
      running: false,
      speed: this.state.speed,
      elapsedSec: 0,
      durationSec: this.scenario.durationSec,
    };
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
        // EO bearing measurement — push as event
        const bearing = simEvent.data as Record<string, unknown>;
        const sensorId = (bearing?.sensorId ?? 'EO') as string;
        this.pushEvent(
          'eo.bearing.measured',
          `${sensorId} bearing measurement at T+${simEvent.timeSec}s`,
          { sensorId, timeSec: simEvent.timeSec },
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

  // ── Helpers ──────────────────────────────────────────────────────────

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
