/**
 * SystemFuser — track-to-track fusion engine.
 *
 * Subscribes to SensorTrackReport messages from the bus, correlates
 * incoming local tracks against existing system tracks, fuses matched
 * tracks using information-matrix fusion, and manages the system track
 * lifecycle (tentative → confirmed → coasting → dropped).
 */

import type {
  SensorId,
  SystemTrackId,
  Timestamp,
  Position3D,
  Velocity3D,
  Covariance3x3,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import type { SensorTrackReport, LocalTrackReport } from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { correlate, fuseObservation } from '@eloc2/fusion-core';
import type { CorrelatorConfig } from '@eloc2/fusion-core';
import { generateId, haversineDistanceM } from '@eloc2/shared-utils';

import type {
  FusedSystemTrack,
  SystemFuserConfig,
} from './types.js';
import { DEFAULT_SYSTEM_FUSER_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// SystemFuser
// ---------------------------------------------------------------------------

export class SystemFuser {
  private bus: SensorBus;
  private config: SystemFuserConfig;
  private systemTracks: Map<string, FusedSystemTrack> = new Map();

  // Buffer incoming track reports per tick
  private pendingReports: SensorTrackReport[] = [];

  // Track last update tick for stale detection
  private lastTickTime = 0;

  constructor(bus: SensorBus, config?: Partial<SystemFuserConfig>) {
    this.bus = bus;
    this.config = { ...DEFAULT_SYSTEM_FUSER_CONFIG, ...config };

    // Subscribe to all sensor track reports
    this.bus.onTrackReport((report) => this.pendingReports.push(report));
  }

  /**
   * Process all buffered track reports — correlate, fuse, update lifecycle.
   * Call once per tick after all sensors have ticked.
   */
  tick(simTimeSec: number): void {
    this.lastTickTime = simTimeSec;
    const updatedTrackIds = new Set<string>();

    // Process each report
    for (const report of this.pendingReports) {
      for (const localTrack of report.localTracks) {
        if (localTrack.status === 'dropped') continue;

        // Convert LocalTrackReport to SourceObservation for correlator
        const obs = this.localTrackToObservation(localTrack, report);

        // Get existing system tracks as SystemTrack[] for correlator
        const existingTracks = this.getTracksForCorrelation();

        // Correlate
        const correlatorConfig: CorrelatorConfig = {
          gateThreshold: this.config.correlationThreshold,
          velocityGateThreshold: this.config.correlationThreshold * 2,
        };
        const result = correlate(obs, existingTracks, correlatorConfig);

        if (
          result.decision === 'new_track' ||
          result.selectedTrackId === undefined
        ) {
          // Create new system track
          const newTrack = this.createSystemTrack(localTrack, report, simTimeSec);
          updatedTrackIds.add(newTrack.systemTrackId as string);
        } else {
          // Fuse with existing system track
          const trackId = result.selectedTrackId as string;
          const existing = this.systemTracks.get(trackId);
          if (existing) {
            this.fuseIntoTrack(existing, localTrack, report, obs, simTimeSec);
            updatedTrackIds.add(trackId);
          }
        }
      }
    }

    // Update miss counts for tracks not updated this tick
    for (const [trackId, track] of this.systemTracks) {
      if (track.status === 'dropped') continue;
      if (!updatedTrackIds.has(trackId)) {
        track.missCount++;
        if (track.missCount >= this.config.dropAfterMisses) {
          track.status = 'dropped';
        } else if (track.missCount >= this.config.coastingMissThreshold) {
          track.status = 'coasting';
        }
      }
    }

    // Merge close tracks
    this.mergeCloseTracks();

    // Clear buffer
    this.pendingReports = [];
  }

  // ── Track Creation ────────────────────────────────────────────────────

  private createSystemTrack(
    localTrack: LocalTrackReport,
    report: SensorTrackReport,
    simTimeSec: number,
  ): FusedSystemTrack {
    const trackId = `SYS-${generateId().slice(0, 8)}` as SystemTrackId;
    const track: FusedSystemTrack = {
      systemTrackId: trackId,
      state: { ...localTrack.position },
      velocity: localTrack.velocity ? { ...localTrack.velocity } : undefined,
      covariance: localTrack.covariance.map((r) => [...r]) as Covariance3x3,
      confidence: localTrack.confidence,
      status: 'tentative',
      lastUpdated: (simTimeSec * 1000) as Timestamp,
      sources: [report.sensorId],
      contributingLocalTrackIds: [localTrack.localTrackId],
      updateCount: 1,
      missCount: 0,
      targetCategory: localTrack.targetCategory,
      classifierConfidence: localTrack.classifierConfidence,
      classification: undefined,
    };
    this.systemTracks.set(trackId as string, track);
    return track;
  }

  // ── Track Fusion ──────────────────────────────────────────────────────

  private fuseIntoTrack(
    track: FusedSystemTrack,
    localTrack: LocalTrackReport,
    report: SensorTrackReport,
    obs: SourceObservation,
    simTimeSec: number,
  ): void {
    // Build a SystemTrack-compatible object for the fuser
    const sysTrack: SystemTrack = {
      systemTrackId: track.systemTrackId,
      state: track.state,
      velocity: track.velocity,
      covariance: track.covariance,
      confidence: track.confidence,
      status: track.status,
      lineage: [],
      lastUpdated: track.lastUpdated,
      sources: track.sources,
      eoInvestigationStatus: 'none',
    };

    const fused = fuseObservation(obs, sysTrack);

    track.state = fused.state;
    track.velocity = localTrack.velocity ?? track.velocity;
    track.covariance = fused.covariance;
    track.confidence = Math.min(1.0, track.confidence + 0.05);
    track.lastUpdated = (simTimeSec * 1000) as Timestamp;
    track.updateCount++;
    track.missCount = 0;

    // Add source if new
    if (!track.sources.includes(report.sensorId)) {
      track.sources.push(report.sensorId);
    }
    if (!track.contributingLocalTrackIds.includes(localTrack.localTrackId)) {
      track.contributingLocalTrackIds.push(localTrack.localTrackId);
    }

    // Update classification from local track if higher confidence
    if (
      localTrack.classifierConfidence > track.classifierConfidence &&
      localTrack.targetCategory !== 'unresolved'
    ) {
      track.targetCategory = localTrack.targetCategory;
      track.classifierConfidence = localTrack.classifierConfidence;
    }

    // Promote status
    if (
      track.status === 'tentative' &&
      track.updateCount >= this.config.confirmAfter
    ) {
      track.status = 'confirmed';
    } else if (track.status === 'coasting') {
      track.status = 'confirmed'; // Re-acquired
    }
  }

  // ── Merge Close Tracks ────────────────────────────────────────────────

  private mergeCloseTracks(): void {
    const active = [...this.systemTracks.values()].filter(
      (t) => t.status !== 'dropped',
    );

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (a.status === 'dropped' || b.status === 'dropped') continue;

        const dist = haversineDistanceM(
          a.state.lat,
          a.state.lon,
          b.state.lat,
          b.state.lon,
        );

        if (dist < this.config.mergeDistanceM) {
          // Merge b into a (a has more updates or higher confidence)
          const keep = a.updateCount >= b.updateCount ? a : b;
          const drop = keep === a ? b : a;

          keep.confidence = Math.max(keep.confidence, drop.confidence);
          for (const src of drop.sources) {
            if (!keep.sources.includes(src)) keep.sources.push(src);
          }
          for (const lt of drop.contributingLocalTrackIds) {
            if (!keep.contributingLocalTrackIds.includes(lt)) {
              keep.contributingLocalTrackIds.push(lt);
            }
          }
          drop.status = 'dropped';
        }
      }
    }
  }

  // ── Conversion helpers ────────────────────────────────────────────────

  private localTrackToObservation(
    lt: LocalTrackReport,
    report: SensorTrackReport,
  ): SourceObservation {
    return {
      observationId: lt.localTrackId,
      sensorId: report.sensorId,
      timestamp: report.timestamp,
      position: { ...lt.position },
      velocity: lt.velocity ? { ...lt.velocity } : undefined,
      covariance: lt.covariance.map((r) => [...r]) as Covariance3x3,
      sensorFrame: report.sensorType === 'radar' ? 'radar' : report.sensorType === 'eo' ? 'eo' : 'c4isr',
    };
  }

  private getTracksForCorrelation(): SystemTrack[] {
    return [...this.systemTracks.values()]
      .filter((t) => t.status !== 'dropped')
      .map((t) => ({
        systemTrackId: t.systemTrackId,
        state: t.state,
        velocity: t.velocity,
        covariance: t.covariance,
        confidence: t.confidence,
        status: t.status,
        lineage: [],
        lastUpdated: t.lastUpdated,
        sources: t.sources,
        eoInvestigationStatus: 'none' as const,
        classification: t.classification,
      }));
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Get all system tracks (including dropped) */
  getAllTracks(): FusedSystemTrack[] {
    return [...this.systemTracks.values()];
  }

  /** Get active (non-dropped) system tracks */
  getActiveTracks(): FusedSystemTrack[] {
    return [...this.systemTracks.values()].filter(
      (t) => t.status !== 'dropped',
    );
  }

  /** Get confirmed system tracks */
  getConfirmedTracks(): FusedSystemTrack[] {
    return [...this.systemTracks.values()].filter(
      (t) => t.status === 'confirmed',
    );
  }

  /** Get track count by status */
  getTrackCounts(): { tentative: number; confirmed: number; coasting: number; dropped: number } {
    const counts = { tentative: 0, confirmed: 0, coasting: 0, dropped: 0 };
    for (const t of this.systemTracks.values()) {
      counts[t.status as keyof typeof counts]++;
    }
    return counts;
  }

  /** Reset all state */
  reset(): void {
    this.systemTracks.clear();
    this.pendingReports = [];
  }
}
