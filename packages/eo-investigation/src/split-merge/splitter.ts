import type {
  BearingMeasurement,
  CueId,
  EoTrackId,
  GroupId,
  Timestamp,
} from '@eloc2/domain';
import type { EoTrack, UnresolvedGroup } from '@eloc2/domain';
import { createLineageEntry } from '@eloc2/domain';
import { generateId } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of attempting to split an unresolved group. */
export interface SplitResult {
  resolvedTracks: EoTrack[];
  remainingGroup: UnresolvedGroup | undefined;
  events: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default angular separation threshold in degrees. */
const DEFAULT_BASE_THRESHOLD = 0.5;

/** Options for adaptive clustering threshold. */
export interface ClusterOptions {
  /** Base angular separation threshold in degrees (default 0.5). */
  baseThreshold?: number;
  /** Average bearing noise in degrees. Higher noise widens the threshold. */
  avgBearingNoise?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempts to split an unresolved group using new bearing measurements.
 *
 * When new measurements show sufficient angular separation (> 0.5 degrees)
 * between detections, split them into individual EO tracks. If some remain
 * ambiguous, keep them in a smaller group.
 *
 * @param group          - The unresolved group to split.
 * @param newBearings    - New bearing measurements from the sensor.
 * @param existingTracks - Map of eoTrackId -> EoTrack for all tracks in the group.
 * @returns A SplitResult with resolved tracks, optional remaining group, and event descriptions.
 */
export function splitGroup(
  group: UnresolvedGroup,
  newBearings: BearingMeasurement[],
  existingTracks: Map<string, EoTrack>,
  options?: ClusterOptions,
): SplitResult {
  const events: string[] = [];

  // Nothing to split if no bearings or empty group
  if (newBearings.length === 0 || group.eoTrackIds.length === 0) {
    return { resolvedTracks: [], remainingGroup: group, events };
  }

  // Cluster bearings by angular separation
  const clusters = clusterBearings(newBearings, options);

  // If only one cluster, nothing can be separated
  if (clusters.length <= 1) {
    events.push('All bearings within separation threshold; no split possible');
    return { resolvedTracks: [], remainingGroup: group, events };
  }

  // Create a new EoTrack for each separable cluster
  const resolvedTracks: EoTrack[] = [];
  const resolvedTrackIds: EoTrackId[] = [];

  for (const cluster of clusters) {
    // Use the first bearing in the cluster as the representative
    const bearing = cluster[0];
    const newTrackId = generateId() as EoTrackId;

    const lineageEntry = createLineageEntry(
      'eo.track.split',
      `Split from group ${group.groupId}`,
      [],
    );

    const newTrack: EoTrack = {
      eoTrackId: newTrackId,
      parentCueId: group.parentCueId,
      sensorId: bearing.sensorId,
      bearing,
      imageQuality: 0.5,
      identificationSupport: undefined,
      status: 'tentative',
      lineage: [lineageEntry],
      associatedSystemTrackId: undefined,
      confidence: 0.5,
      lastUpdated: Date.now() as Timestamp,
    };

    resolvedTracks.push(newTrack);
    resolvedTrackIds.push(newTrackId);
    events.push(
      `Created track ${newTrackId} from bearing az=${bearing.azimuthDeg}`,
    );
  }

  // Determine remaining group: if all original tracks resolved, no remaining group
  const remainingIds = group.eoTrackIds.filter(
    (id) => !resolvedTrackIds.includes(id),
  );

  let remainingGroup: UnresolvedGroup | undefined;
  if (remainingIds.length > 0) {
    remainingGroup = {
      ...group,
      eoTrackIds: remainingIds,
    };
    events.push(
      `Remaining group ${group.groupId} has ${remainingIds.length} unresolved tracks`,
    );
  } else {
    // All resolved — mark the group as resolved
    remainingGroup = undefined;
    events.push(`Group ${group.groupId} fully resolved`);
  }

  return { resolvedTracks, remainingGroup, events };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clusters bearings by angular separation. Two bearings are in the same cluster
 * if they are within the angular separation threshold.
 *
 * Supports adaptive threshold: `threshold = baseThreshold * (1 + avgBearingNoise / 0.5)`.
 * When avgBearingNoise = 0 (default), the threshold equals baseThreshold (backward compatible).
 */
export function clusterBearings(
  bearings: BearingMeasurement[],
  options?: ClusterOptions,
): BearingMeasurement[][] {
  if (bearings.length === 0) return [];

  const baseThreshold = options?.baseThreshold ?? DEFAULT_BASE_THRESHOLD;
  const avgNoise = options?.avgBearingNoise ?? 0;
  const threshold = baseThreshold * (1 + avgNoise / 0.5);

  // Sort by azimuth for easier clustering
  const sorted = [...bearings].sort(
    (a, b) => a.azimuthDeg - b.azimuthDeg,
  );

  const clusters: BearingMeasurement[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastCluster = clusters[clusters.length - 1];
    const lastBearing = lastCluster[lastCluster.length - 1];

    const azDiff = Math.abs(current.azimuthDeg - lastBearing.azimuthDeg);
    const elDiff = Math.abs(
      current.elevationDeg - lastBearing.elevationDeg,
    );
    const angularSep = Math.sqrt(azDiff * azDiff + elDiff * elDiff);

    if (angularSep <= threshold) {
      // Same cluster
      lastCluster.push(current);
    } else {
      // New cluster
      clusters.push([current]);
    }
  }

  return clusters;
}
