/**
 * EoCoreEntity — central EO processing entity that aggregates bearings
 * from all EO sensors, performs cross-sensor triangulation, manages EO
 * tracks, and publishes triangulated positions as SensorTrackReport
 * to the system fuser.
 */

import type { SensorId, Timestamp } from '@eloc2/domain';
import type {
  SensorTrackReport,
  LocalTrackReport,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import { BearingAggregator } from './bearing-aggregator.js';
import { triangulateFromBearings } from './triangulator.js';
import { EoTrackManager } from './eo-track-manager.js';
import type { EoCoreConfig, EoCoreTrack } from './types.js';

// ---------------------------------------------------------------------------
// EoCoreEntity
// ---------------------------------------------------------------------------

export class EoCoreEntity {
  private bus: SensorBus;
  private aggregator: BearingAggregator;
  private trackManager: EoTrackManager;

  constructor(bus: SensorBus, config?: Partial<EoCoreConfig>) {
    this.bus = bus;
    this.aggregator = new BearingAggregator();
    this.trackManager = new EoTrackManager(config);

    // Subscribe to all bearing reports from EO sensors
    this.bus.onBearingReport((report) => this.aggregator.ingestReport(report));
  }

  /** Called once per tick after all sensors have ticked */
  tick(simTimeSec: number): void {
    // 1. Find cross-sensor matches (≥2 sensors reporting same target)
    const matches = this.aggregator.findCrossSensorMatches();

    // 2. Triangulate each match and associate to tracks
    //    Process all matches, then do a coordinated assignment to avoid
    //    multiple targets claiming the same track in tight formations.
    const triangulations: Array<{
      result: import('./types.js').TriangulationOutput;
      targetId: string;
    }> = [];

    for (const match of matches) {
      const result = triangulateFromBearings(match.bearings);
      if (!result) continue;
      if (result.quality === 'insufficient') continue;
      triangulations.push({ result, targetId: match.targetId });
    }

    // 3. Coordinated assignment: each triangulation claims a track,
    //    already-claimed tracks are not available to subsequent triangulations.
    const claimedTrackIds = new Set<string>();

    for (const { result, targetId } of triangulations) {
      const existingTrack = this.trackManager.findNearestTrack(result, targetId, simTimeSec);
      if (existingTrack && !claimedTrackIds.has(existingTrack.trackId)) {
        this.trackManager.updateTrack(existingTrack, result, simTimeSec, targetId);
        claimedTrackIds.add(existingTrack.trackId);
      } else {
        // No available track within gate → create new
        const newTrack = this.trackManager.createTrack(result, simTimeSec, targetId);
        claimedTrackIds.add(newTrack.trackId);
      }
    }

    // 4. Mark stale tracks
    this.trackManager.markStaleTracks(simTimeSec);

    // 5. Publish EO tracks as SensorTrackReport to system fuser
    this.publishEoTracks(simTimeSec);

    // 6. Clear bearing buffer for next tick
    this.aggregator.clear();
  }

  /** Publish triangulated EO tracks as local track reports */
  private publishEoTracks(simTimeSec: number): void {
    const activeTracks = this.trackManager.getActiveTracks();
    if (activeTracks.length === 0) return;

    const localTracks: LocalTrackReport[] = activeTracks.map((t) => ({
      localTrackId: t.trackId,
      sensorId: 'EO-CORE' as SensorId,
      position: { ...t.position },
      velocity: t.velocity ? { ...t.velocity } : undefined,
      covariance: qualityToCovariance(t.quality),
      confidence: t.confidence,
      status: 'maintained' as const,
      updateCount: t.updateCount,
      missCount: 0,
      existenceProbability: t.confidence,
      targetCategory: 'unresolved',
      classifierConfidence: 0,
      lastObservationTime: t.lastUpdateSec,
      positionHistory: [],
    }));

    const report: SensorTrackReport = {
      messageType: 'sensor.track.report',
      sensorId: 'EO-CORE' as SensorId,
      sensorType: 'eo',
      timestamp: Date.now() as Timestamp,
      simTimeSec,
      localTracks,
      sensorStatus: {
        sensorId: 'EO-CORE' as SensorId,
        sensorType: 'eo',
        online: true,
        mode: 'track',
        trackCount: activeTracks.length,
      },
    };

    this.bus.publishTrackReport(report);
  }

  /** Get all EO CORE tracks */
  getAllTracks(): EoCoreTrack[] {
    return this.trackManager.getAllTracks();
  }

  /** Get active EO CORE tracks */
  getActiveTracks(): EoCoreTrack[] {
    return this.trackManager.getActiveTracks();
  }

  /** Get the bearing aggregator (for testing/inspection) */
  getAggregator(): BearingAggregator {
    return this.aggregator;
  }

  /** Reset all state */
  reset(): void {
    this.trackManager.reset();
    this.aggregator.clear();
  }
}
