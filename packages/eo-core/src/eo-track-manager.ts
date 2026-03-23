/**
 * EoTrackManager — EO-specific track lifecycle for CORE entity.
 * Creates/updates/drops tracks from triangulation results.
 */

import { generateId, haversineDistanceM } from '@eloc2/shared-utils';
import type { TriangulationOutput, EoCoreTrack, EoCoreConfig } from './types.js';

const DEFAULT_CONFIG: EoCoreConfig = {
  staleTimeoutSec: 10,
  dropTimeoutSec: 30,
  trackAssociationDistanceM: 2000,
};

export class EoTrackManager {
  private tracks: Map<string, EoCoreTrack> = new Map();
  private config: EoCoreConfig;

  constructor(config?: Partial<EoCoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Find nearest existing active/stale track to a triangulation result */
  findNearestTrack(result: TriangulationOutput): EoCoreTrack | null {
    let best: EoCoreTrack | null = null;
    let bestDist = this.config.trackAssociationDistanceM;

    for (const track of this.tracks.values()) {
      if (track.status === 'dropped') continue;
      const dist = haversineDistanceM(
        track.position.lat,
        track.position.lon,
        result.position.lat,
        result.position.lon,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = track;
      }
    }
    return best;
  }

  /** Create a new EO track from a triangulation result */
  createTrack(result: TriangulationOutput, simTimeSec: number): EoCoreTrack {
    const track: EoCoreTrack = {
      trackId: `EO-${generateId().slice(0, 8)}`,
      position: { ...result.position },
      confidence: result.quality === 'strong' ? 0.9 : result.quality === 'acceptable' ? 0.7 : 0.4,
      quality: result.quality,
      intersectionAngleDeg: result.intersectionAngleDeg,
      sensorIds: [...result.sensorIds],
      updateCount: 1,
      lastUpdateSec: simTimeSec,
      status: 'active',
    };
    this.tracks.set(track.trackId, track);
    return track;
  }

  /** Update an existing track with a new triangulation result */
  updateTrack(
    track: EoCoreTrack,
    result: TriangulationOutput,
    simTimeSec: number,
  ): void {
    // Weighted blend — 70% new, 30% old
    const alpha = 0.7;
    track.position = {
      lat: alpha * result.position.lat + (1 - alpha) * track.position.lat,
      lon: alpha * result.position.lon + (1 - alpha) * track.position.lon,
      alt: alpha * result.position.alt + (1 - alpha) * track.position.alt,
    };
    track.quality = result.quality;
    track.intersectionAngleDeg = result.intersectionAngleDeg;
    track.sensorIds = [...result.sensorIds];
    track.updateCount++;
    track.lastUpdateSec = simTimeSec;
    track.status = 'active';
    track.confidence = Math.min(
      1.0,
      track.confidence + 0.05,
    );
  }

  /** Mark stale tracks and drop old ones */
  markStaleTracks(simTimeSec: number): void {
    for (const track of this.tracks.values()) {
      if (track.status === 'dropped') continue;

      const elapsed = simTimeSec - track.lastUpdateSec;
      if (elapsed > this.config.dropTimeoutSec) {
        track.status = 'dropped';
      } else if (elapsed > this.config.staleTimeoutSec) {
        track.status = 'stale';
      }
    }
  }

  /** Get all tracks (including dropped) */
  getAllTracks(): EoCoreTrack[] {
    return [...this.tracks.values()];
  }

  /** Get active tracks only */
  getActiveTracks(): EoCoreTrack[] {
    return [...this.tracks.values()].filter((t) => t.status === 'active');
  }

  /** Reset all tracks */
  reset(): void {
    this.tracks.clear();
  }
}
