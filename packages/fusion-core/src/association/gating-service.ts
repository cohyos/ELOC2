/**
 * Shared gating service: builds a gating matrix between observations and tracks,
 * then finds independent clusters via connected components.
 */

import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  Covariance3x3,
} from '@eloc2/domain';
import {
  geodeticToENU,
  mat3x3Add,
  mat3x3Inverse,
  mahalanobisDistance,
  DEG_TO_RAD,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatingConfig {
  /** Chi-squared gate threshold. Default 16.27 (3-DoF, 99.9%). */
  gateThreshold: number;
  /** Max prediction horizon in seconds. */
  maxPredictionTimeSec: number;
}

export const DEFAULT_GATING_CONFIG: GatingConfig = {
  gateThreshold: 16.27,
  maxPredictionTimeSec: 30,
};

/** A single entry in the gating matrix: observation i can be associated with track j. */
export interface GatingEntry {
  observationIndex: number;
  trackIndex: number;
  mahalanobisDistSq: number;
  innovation: number[];
}

/** The full gating matrix: a sparse structure of feasible (obs, track) pairs. */
export interface GatingMatrix {
  entries: GatingEntry[];
  observationCount: number;
  trackCount: number;
  /** Track IDs indexed by trackIndex. */
  trackIds: SystemTrackId[];
  /** Observation IDs indexed by observationIndex. */
  observationIds: string[];
}

/** A cluster of interacting observations and tracks. */
export interface Cluster {
  trackIndices: number[];
  observationIndices: number[];
}

// ---------------------------------------------------------------------------
// Build gating matrix
// ---------------------------------------------------------------------------

/**
 * Build a gating matrix: for each (observation, track) pair, compute the
 * Mahalanobis distance and include it if it passes the gate.
 */
export function buildGatingMatrix(
  observations: SourceObservation[],
  tracks: SystemTrack[],
  config: GatingConfig = DEFAULT_GATING_CONFIG,
): GatingMatrix {
  const entries: GatingEntry[] = [];

  for (let oi = 0; oi < observations.length; oi++) {
    const obs = observations[oi];
    const refLat = obs.position.lat;
    const refLon = obs.position.lon;
    const refAlt = obs.position.alt;

    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti];
      if (track.status === 'dropped') continue;

      // Predict track position forward
      let predLat = track.state.lat;
      let predLon = track.state.lon;
      let predAlt = track.state.alt;
      let predCov = track.covariance;

      if (track.velocity && track.lastUpdated > 0) {
        const dtSec = (obs.timestamp - track.lastUpdated) / 1000;
        if (dtSec > 0 && dtSec < config.maxPredictionTimeSec) {
          const metersPerDegLat = 111_320;
          const metersPerDegLon = metersPerDegLat * Math.cos(predLat * DEG_TO_RAD);
          predLat += (track.velocity.vy * dtSec) / metersPerDegLat;
          predLon += (track.velocity.vx * dtSec) / metersPerDegLon;
          predAlt += (track.velocity.vz ?? 0) * dtSec;

          const qDiag = 100 * dtSec;
          predCov = [
            [track.covariance[0][0] + qDiag, track.covariance[0][1], track.covariance[0][2]],
            [track.covariance[1][0], track.covariance[1][1] + qDiag, track.covariance[1][2]],
            [track.covariance[2][0], track.covariance[2][1], track.covariance[2][2] + qDiag],
          ] as Covariance3x3;
        }
      }

      const enu = geodeticToENU(predLat, predLon, predAlt, refLat, refLon, refAlt);
      const innovation = [enu.east, enu.north, enu.up];

      const combinedCov = mat3x3Add(predCov, obs.covariance);
      const invCov = mat3x3Inverse(combinedCov);
      if (!invCov) continue;

      const dist = mahalanobisDistance(innovation, invCov);
      const distSq = dist * dist;

      if (distSq <= config.gateThreshold) {
        entries.push({
          observationIndex: oi,
          trackIndex: ti,
          mahalanobisDistSq: distSq,
          innovation,
        });
      }
    }
  }

  return {
    entries,
    observationCount: observations.length,
    trackCount: tracks.length,
    trackIds: tracks.map(t => t.systemTrackId),
    observationIds: observations.map(o => o.observationId),
  };
}

// ---------------------------------------------------------------------------
// Cluster finding (connected components)
// ---------------------------------------------------------------------------

/**
 * Find independent clusters of interacting observations and tracks.
 *
 * Uses union-find over the gating matrix: observations and tracks that
 * share a gating entry are in the same cluster.
 */
export function findClusters(gatingMatrix: GatingMatrix): Cluster[] {
  const nObs = gatingMatrix.observationCount;
  const nTrk = gatingMatrix.trackCount;
  const totalNodes = nObs + nTrk;

  // Union-find
  const parent = Array.from({ length: totalNodes }, (_, i) => i);
  const rank = new Array(totalNodes).fill(0);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra]++;
    }
  }

  // Observation nodes: 0..nObs-1, Track nodes: nObs..nObs+nTrk-1
  for (const entry of gatingMatrix.entries) {
    union(entry.observationIndex, nObs + entry.trackIndex);
  }

  // Group by root
  const groups = new Map<number, { obsIndices: Set<number>; trkIndices: Set<number> }>();
  for (const entry of gatingMatrix.entries) {
    const root = find(entry.observationIndex);
    if (!groups.has(root)) {
      groups.set(root, { obsIndices: new Set(), trkIndices: new Set() });
    }
    const group = groups.get(root)!;
    group.obsIndices.add(entry.observationIndex);
    group.trkIndices.add(entry.trackIndex);
  }

  return [...groups.values()].map(g => ({
    trackIndices: [...g.trkIndices],
    observationIndices: [...g.obsIndices],
  }));
}
