import type { Position3D, SensorId, SensorType, Timestamp } from '@eloc2/domain';
import type {
  GroundTruthBroadcast,
  GroundTruthTarget,
  LocalTrackReport,
  SensorStatusReport,
  SensorTrackReport,
  SystemCommand,
  GatingOverrideCommand,
  SensorMode,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { TrackManager } from '@eloc2/fusion-core';
import type { TrackManagerConfig } from '@eloc2/fusion-core';
import { RegistrationHealthService } from '@eloc2/registration';

import type { SensorInstanceConfig, SensorTickResult } from './types.js';

export abstract class SensorInstance {
  readonly sensorId: string;
  readonly sensorType: SensorType;
  readonly config: SensorInstanceConfig;

  protected bus: SensorBus;
  protected mode: SensorMode = 'track';
  protected online: boolean = true;
  protected localTrackManager: TrackManager;
  protected registrationService: RegistrationHealthService;

  // Ground truth cache — filtered by this sensor's coverage
  protected visibleTargets: Map<string, GroundTruthTarget> = new Map();

  // Timing
  protected lastUpdateSimSec: number = 0;
  private stepCounter: number = 0;

  // Observation history for reporting
  protected positionHistory: Map<string, Array<{ lat: number; lon: number; alt: number; timeSec: number }>> = new Map();
  private static readonly MAX_POSITION_HISTORY = 10;

  constructor(config: SensorInstanceConfig, bus: SensorBus, trackManagerConfig?: Partial<TrackManagerConfig>) {
    this.sensorId = config.sensorId;
    this.sensorType = config.type;
    this.config = config;
    this.bus = bus;

    // Each sensor has its OWN TrackManager for local correlation + fusion
    this.localTrackManager = new TrackManager({
      confirmAfter: 3,
      dropAfterMisses: 8,
      enableExistence: true,
      existencePromotionThreshold: 0.5,
      existenceConfirmationThreshold: 0.8,
      existenceDeletionThreshold: 0.05,
      coastingMissThreshold: 3,
      pDetection: 0.9,
      pFalseAlarm: 0.01,
      maxCoastingTimeSec: 15,
      associationMode: 'nn',
      enableIMM: true,
      enableTBD: false,
      ...trackManagerConfig,
    });

    // Each sensor has its own registration health
    this.registrationService = new RegistrationHealthService();

    // Subscribe to GT broadcasts
    this.bus.onGroundTruth((gt) => this.handleGroundTruth(gt));

    // Subscribe to commands for this sensor
    this.bus.onCommand(this.sensorId, (cmd) => this.handleCommand(cmd));
  }

  // ── Abstract methods (implemented by each sensor type) ──

  /** Main processing tick — generate observations, update local tracks, publish reports */
  abstract tick(simTimeSec: number, dtSec: number): SensorTickResult;

  /** Check if a target is within this sensor's coverage/detection envelope */
  abstract filterTargetByCoverage(target: GroundTruthTarget): boolean;

  // ── GT Handling ──

  protected handleGroundTruth(gt: GroundTruthBroadcast): void {
    this.visibleTargets.clear();
    for (const target of gt.targets) {
      if (target.active && this.filterTargetByCoverage(target)) {
        this.visibleTargets.set(target.targetId, target);
      }
    }
  }

  // ── Command Handling ──

  protected handleCommand(cmd: SystemCommand): void {
    const command = cmd.command;
    switch (command.type) {
      case 'mode':
        this.mode = command.mode;
        break;
      case 'gating_override':
        this.handleGatingOverride(command);
        break;
      // cue and search_pattern are handled by EO subclass
      default:
        break;
    }
  }

  protected handleGatingOverride(_cmd: GatingOverrideCommand): void {
    // Override local track classification — subclasses can extend
    // This is where system-level ABT/BM override happens
  }

  // ── Update Rate Check ──

  /** Check if this sensor should generate observations this tick based on its update rate */
  protected shouldUpdate(simTimeSec: number): boolean {
    if (!this.online || this.mode === 'standby') return false;
    const elapsed = simTimeSec - this.lastUpdateSimSec;
    return elapsed >= this.config.updateIntervalSec;
  }

  // ── Local Track Reporting ──

  /** Build LocalTrackReport[] from local TrackManager state */
  protected buildLocalTrackReports(): LocalTrackReport[] {
    const tracks = this.localTrackManager.getAllTracks().filter(t => t.status !== 'dropped');
    return tracks.map(track => {
      const trackId = track.systemTrackId as string;
      const history = this.positionHistory.get(trackId) ?? [];

      return {
        localTrackId: trackId,
        sensorId: this.sensorId as SensorId,
        position: { ...track.state },
        velocity: track.velocity ? { ...track.velocity } : undefined,
        covariance: track.covariance.map(row => [...row]),
        confidence: track.confidence,
        status: this.mapTrackStatus(track.status),
        updateCount: track.lineage?.length ?? 0,
        missCount: 0, // Would need TrackMeta access
        existenceProbability: track.existenceProbability ?? track.confidence,
        targetCategory: 'unresolved', // Subclass overrides with actual category
        classifierConfidence: 0,
        lastObservationTime: (track.lastUpdated as number) / 1000, // Convert ms to sec
        positionHistory: history.slice(-SensorInstance.MAX_POSITION_HISTORY),
      } satisfies LocalTrackReport;
    });
  }

  private mapTrackStatus(status: string): 'new' | 'maintained' | 'coasting' | 'dropped' {
    switch (status) {
      case 'tentative': return 'new';
      case 'confirmed': return 'maintained';
      case 'coasting': return 'coasting';
      case 'dropped': return 'dropped';
      default: return 'new';
    }
  }

  /** Publish sensor track report to the bus */
  protected publishTrackReport(simTimeSec: number): void {
    const report: SensorTrackReport = {
      messageType: 'sensor.track.report',
      sensorId: this.sensorId as SensorId,
      sensorType: this.sensorType,
      timestamp: Date.now() as Timestamp,
      simTimeSec,
      localTracks: this.buildLocalTrackReports(),
      sensorStatus: this.buildStatusReport(),
    };
    this.bus.publishTrackReport(report);
  }

  /** Build sensor status report */
  protected buildStatusReport(): SensorStatusReport {
    const health = this.registrationService.getHealth(this.sensorId as SensorId);
    return {
      sensorId: this.sensorId as SensorId,
      sensorType: this.sensorType,
      online: this.online,
      mode: this.mode,
      trackCount: this.localTrackManager.getAllTracks().filter(t => t.status !== 'dropped').length,
      registrationHealth: health?.spatialQuality,
    };
  }

  // ── Position History ──

  protected recordPositionHistory(trackId: string, pos: Position3D, timeSec: number): void {
    if (!this.positionHistory.has(trackId)) {
      this.positionHistory.set(trackId, []);
    }
    const history = this.positionHistory.get(trackId)!;
    history.push({ lat: pos.lat, lon: pos.lon, alt: pos.alt, timeSec });
    if (history.length > SensorInstance.MAX_POSITION_HISTORY * 2) {
      this.positionHistory.set(trackId, history.slice(-SensorInstance.MAX_POSITION_HISTORY));
    }
  }

  // ── Lifecycle ──

  setOnline(online: boolean): void {
    this.online = online;
  }

  getMode(): SensorMode {
    return this.mode;
  }

  isOnline(): boolean {
    return this.online;
  }

  destroy(): void {
    // Subclasses can override for cleanup
  }
}
