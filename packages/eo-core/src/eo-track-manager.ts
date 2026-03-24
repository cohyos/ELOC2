/**
 * EoTrackManager — EO-specific track lifecycle for CORE entity.
 * Creates/updates/drops tracks from triangulation results.
 */

import { generateId, haversineDistanceM } from '@eloc2/shared-utils';
import type { TriangulationOutput, EoCoreTrack, EoCoreConfig } from './types.js';

const DEFAULT_CONFIG: EoCoreConfig = {
  staleTimeoutSec: 10,
  dropTimeoutSec: 30,
  trackAssociationDistanceM: 150, // Base gate: EO staring sensors resolve ~300m formation spacing
  useTargetIdAffinity: true,       // Enable targetId affinity for formation resolution
};

export class EoTrackManager {
  private tracks: Map<string, EoCoreTrack> = new Map();
  private config: EoCoreConfig;

  constructor(config?: Partial<EoCoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find nearest existing active/stale track to a triangulation result.
   * Uses targetId affinity to prefer matching the same bearing-group target
   * to the same track — critical for resolving tight formations where
   * multiple targets are within the association gate.
   */
  findNearestTrack(result: TriangulationOutput, targetId?: string, simTimeSec?: number): EoCoreTrack | null {
    let best: EoCoreTrack | null = null;
    let bestScore = Infinity;
    const baseGate = this.config.trackAssociationDistanceM;

    for (const track of this.tracks.values()) {
      if (track.status === 'dropped') continue;
      const dist = haversineDistanceM(
        track.position.lat,
        track.position.lon,
        result.position.lat,
        result.position.lon,
      );

      // Velocity-adaptive gate: expand base gate by track speed × elapsed time.
      // Fast-moving targets need a wider gate to maintain continuity, but
      // targetId affinity still prevents merging in tight formations.
      // Cap at 5× base to handle fast movers (300+ m/s) while affinity
      // prevents formation merging.
      let effectiveGate = baseGate;
      if (track.velocity && simTimeSec !== undefined) {
        const speed = Math.sqrt(track.velocity.vx ** 2 + track.velocity.vy ** 2 + (track.velocity.vz ?? 0) ** 2);
        const dt = Math.max(0, simTimeSec - track.lastUpdateSec);
        effectiveGate = Math.min(baseGate * 5, baseGate + speed * dt * 1.5);
      }
      if (dist >= effectiveGate) continue;

      // Score: distance, penalized if track has velocity pointing away from result
      let score = dist;
      if (track.velocity && dist > 50) {
        const dLat = result.position.lat - track.position.lat;
        const dLon = result.position.lon - track.position.lon;
        const mag = Math.sqrt(dLat * dLat + dLon * dLon);
        if (mag > 1e-10) {
          const nx = dLon / mag;
          const ny = dLat / mag;
          const vMag = Math.sqrt(track.velocity.vx ** 2 + track.velocity.vy ** 2);
          if (vMag > 1) {
            const vnx = track.velocity.vx / vMag;
            const vny = track.velocity.vy / vMag;
            const dot = nx * vnx + ny * vny;
            if (dot < 0) score *= (1.5 - dot);
          }
        }
      }

      // TargetId affinity: strong bonus for matching the same target.
      // This prevents oscillation in tight formations where multiple
      // triangulations fall within the gate distance.
      if (this.config.useTargetIdAffinity && targetId && track.targetIdAffinity) {
        if (track.targetIdAffinity === targetId) {
          score *= 0.1; // 10x preference for same targetId
        } else {
          // Different targetId already owns this track — penalize heavily
          score *= 3.0;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        best = track;
      }
    }
    return best;
  }

  /** Create a new EO track from a triangulation result */
  createTrack(result: TriangulationOutput, simTimeSec: number, targetId?: string): EoCoreTrack {
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
      targetIdAffinity: targetId,
    };
    this.tracks.set(track.trackId, track);
    return track;
  }

  /** Update an existing track with a new triangulation result */
  updateTrack(
    track: EoCoreTrack,
    result: TriangulationOutput,
    simTimeSec: number,
    targetId?: string,
  ): void {
    // Refresh targetId affinity
    if (targetId) track.targetIdAffinity = targetId;
    // Estimate velocity from position delta
    const dt = simTimeSec - track.lastUpdateSec;
    if (dt > 0.1) {
      const dLat = result.position.lat - track.position.lat;
      const dLon = result.position.lon - track.position.lon;
      const dAlt = result.position.alt - track.position.alt;
      // Convert lat/lon deltas to m/s (approximate)
      const vy = (dLat * 111_320) / dt;   // north m/s
      const vx = (dLon * 111_320 * Math.cos(track.position.lat * Math.PI / 180)) / dt; // east m/s
      const vz = dAlt / dt;
      // Low-pass blend if velocity already exists
      if (track.velocity) {
        const vAlpha = 0.6;
        track.velocity = {
          vx: vAlpha * vx + (1 - vAlpha) * track.velocity.vx,
          vy: vAlpha * vy + (1 - vAlpha) * track.velocity.vy,
          vz: vAlpha * vz + (1 - vAlpha) * track.velocity.vz,
        };
      } else {
        track.velocity = { vx, vy, vz };
      }
    }

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
      track.confidence + 0.10, // Faster confidence growth (was 0.05)
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

    // Prune long-dropped tracks to prevent unbounded Map growth
    const pruneAfterSec = (this.config.dropTimeoutSec ?? 30) * 2;
    for (const [id, track] of this.tracks) {
      if (track.status === 'dropped' && simTimeSec - track.lastUpdateSec > pruneAfterSec) {
        this.tracks.delete(id);
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
