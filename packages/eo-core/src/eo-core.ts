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

    // 2. Triangulate each match
    for (const match of matches) {
      const result = triangulateFromBearings(match.bearings);
      if (!result) continue;
      if (result.quality === 'insufficient') continue;

      // 3. Create or update EO track
      const existingTrack = this.trackManager.findNearestTrack(result);
      if (existingTrack) {
        this.trackManager.updateTrack(existingTrack, result, simTimeSec);
      } else {
        this.trackManager.createTrack(result, simTimeSec);
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
      covariance: [
        [100, 0, 0],
        [0, 100, 0],
        [0, 0, 100],
      ],
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
