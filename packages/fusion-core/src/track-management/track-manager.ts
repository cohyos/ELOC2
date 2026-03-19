import type {
  Covariance3x3,
  Position3D,
  RegistrationState,
  SensorId,
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  Timestamp,
} from '@eloc2/domain';
import { createLineageEntry } from '@eloc2/domain';
import type {
  CorrelationDecided,
  SystemTrackUpdated,
} from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';
import { generateId, haversineDistanceM } from '@eloc2/shared-utils';

import { correlate } from '../correlation/correlator.js';
import type { CorrelationResult, CorrelatorConfig } from '../correlation/correlator.js';
import { fuseObservation, fuseWithRegistration } from '../fusion/fuser.js';
import type { FusedState } from '../fusion/fuser.js';
import { normalizeObservation } from '../ingest/source-ingest.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TrackManagerConfig {
  /** Number of consistent updates required to confirm a tentative track. */
  confirmAfter: number;
  /** Number of consecutive misses before a track is dropped. */
  dropAfterMisses: number;
}

const DEFAULT_CONFIG: TrackManagerConfig = {
  confirmAfter: 3,
  dropAfterMisses: 5,
};

// ---------------------------------------------------------------------------
// Internal bookkeeping per track
// ---------------------------------------------------------------------------

interface TrackMeta {
  updateCount: number;
  missCount: number;
}

// ---------------------------------------------------------------------------
// ProcessObservationResult
// ---------------------------------------------------------------------------

export interface ProcessObservationResult {
  track: SystemTrack;
  event: SystemTrackUpdated;
  correlationEvent: CorrelationDecided;
}

// ---------------------------------------------------------------------------
// TrackManager
// ---------------------------------------------------------------------------

export class TrackManager {
  readonly tracks: Map<string, SystemTrack> = new Map();

  private readonly meta: Map<string, TrackMeta> = new Map();
  private readonly config: TrackManagerConfig;
  private correlatorConfig: CorrelatorConfig = { gateThreshold: 16.27 };
  private mergeDistanceM: number = 3000;

  constructor(config: Partial<TrackManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Runtime configuration ─────────────────────────────────────────────

  /**
   * Update the correlator configuration at runtime.
   * Affects all subsequent correlate() calls.
   */
  setCorrelatorConfig(config: Partial<CorrelatorConfig>): void {
    this.correlatorConfig = { ...this.correlatorConfig, ...config };
  }

  /**
   * Get the current correlator configuration.
   */
  getCorrelatorConfig(): CorrelatorConfig {
    return { ...this.correlatorConfig };
  }

  /**
   * Set the merge distance used by mergeCloseTracks().
   */
  setMergeDistance(distanceM: number): void {
    this.mergeDistanceM = distanceM;
  }

  /**
   * Get the current merge distance.
   */
  getMergeDistance(): number {
    return this.mergeDistanceM;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  createTrack(
    observation: SourceObservation,
    correlationResult: CorrelationResult,
  ): SystemTrack {
    const id = generateId() as SystemTrackId;
    const now = Date.now() as Timestamp;

    const track: SystemTrack = {
      systemTrackId: id,
      state: { ...observation.position },
      velocity: observation.velocity ? { ...observation.velocity } : undefined,
      covariance: observation.covariance.map((row) => [...row]) as Covariance3x3,
      confidence: 0.3, // initial low confidence for tentative track
      status: 'tentative',
      lineage: [
        createLineageEntry(
          'track.created',
          `New track from observation ${observation.observationId} (${correlationResult.method})`,
        ),
      ],
      lastUpdated: now,
      sources: [observation.sensorId],
      eoInvestigationStatus: 'none',
    };

    this.tracks.set(id, track);
    this.meta.set(id, { updateCount: 1, missCount: 0 });

    return track;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  updateTrack(
    trackId: SystemTrackId,
    fusedState: FusedState,
    observation: SourceObservation,
  ): SystemTrack {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    const meta = this.meta.get(trackId)!;

    const previousState: Position3D = { ...track.state };

    track.state = { ...fusedState.state };
    track.covariance = fusedState.covariance.map((row) => [...row]) as Covariance3x3;
    track.confidence = fusedState.confidence;
    track.lastUpdated = Date.now() as Timestamp;

    // Add source if not already present
    if (!track.sources.includes(observation.sensorId)) {
      track.sources = [...track.sources, observation.sensorId];
    }

    // Add lineage entry
    track.lineage = [
      ...track.lineage,
      createLineageEntry(
        'track.updated',
        `Fused observation ${observation.observationId} from sensor ${observation.sensorId}`,
      ),
    ];

    // Increment update count and reset miss count
    meta.updateCount++;
    meta.missCount = 0;

    // Auto-confirm if threshold reached
    if (track.status === 'tentative' && meta.updateCount >= this.config.confirmAfter) {
      track.status = 'confirmed';
      track.lineage = [
        ...track.lineage,
        createLineageEntry(
          'track.confirmed',
          `Confirmed after ${meta.updateCount} consistent updates`,
        ),
      ];
    }

    return track;
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  confirmTrack(trackId: SystemTrackId): SystemTrack {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    track.status = 'confirmed';
    track.lineage = [
      ...track.lineage,
      createLineageEntry('track.confirmed', 'Manually confirmed'),
    ];

    return track;
  }

  // ── Drop ──────────────────────────────────────────────────────────────────

  dropTrack(trackId: SystemTrackId): SystemTrack {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    track.status = 'dropped';
    track.lineage = [
      ...track.lineage,
      createLineageEntry('track.dropped', 'Track dropped'),
    ];

    return track;
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  mergeTracks(trackId1: SystemTrackId, trackId2: SystemTrackId): SystemTrack {
    const track1 = this.tracks.get(trackId1);
    const track2 = this.tracks.get(trackId2);

    if (!track1) throw new Error(`Track ${trackId1} not found`);
    if (!track2) throw new Error(`Track ${trackId2} not found`);

    const newId = generateId() as SystemTrackId;
    const now = Date.now() as Timestamp;

    // Use the track with higher confidence as the primary state
    const primary = track1.confidence >= track2.confidence ? track1 : track2;

    // Combine source lists (deduplicate)
    const sources = [...new Set([...track1.sources, ...track2.sources])] as SensorId[];

    const mergedTrack: SystemTrack = {
      systemTrackId: newId,
      state: { ...primary.state },
      velocity: primary.velocity ? { ...primary.velocity } : undefined,
      covariance: primary.covariance.map((row) => [...row]) as Covariance3x3,
      confidence: Math.max(track1.confidence, track2.confidence),
      status: primary.status,
      lineage: [
        ...track1.lineage,
        ...track2.lineage,
        createLineageEntry(
          'track.merged',
          `Merged tracks ${trackId1} and ${trackId2}`,
          [trackId1, trackId2],
        ),
      ],
      lastUpdated: now,
      sources,
      eoInvestigationStatus: 'none',
    };

    // Drop old tracks
    track1.status = 'dropped';
    track2.status = 'dropped';

    this.tracks.set(newId, mergedTrack);

    // Combine meta
    const meta1 = this.meta.get(trackId1);
    const meta2 = this.meta.get(trackId2);
    this.meta.set(newId, {
      updateCount: (meta1?.updateCount ?? 0) + (meta2?.updateCount ?? 0),
      missCount: 0,
    });

    return mergedTrack;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getAllTracks(): SystemTrack[] {
    return [...this.tracks.values()];
  }

  getTrack(trackId: SystemTrackId): SystemTrack | undefined {
    return this.tracks.get(trackId);
  }

  // ── EO investigation support ─────────────────────────────────────────────

  /**
   * Adjusts a track's confidence by the given delta, clamping to [0, 1].
   *
   * @param trackId - The system track to adjust.
   * @param delta   - Confidence change (positive to boost, negative to reduce).
   */
  adjustConfidence(trackId: SystemTrackId | string, delta: number): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    track.confidence = Math.max(0, Math.min(1, track.confidence + delta));
  }

  /**
   * Sets the EO investigation status on a system track.
   *
   * @param trackId - The system track to update.
   * @param status  - New EO investigation status.
   */
  setEoInvestigationStatus(
    trackId: SystemTrackId | string,
    status: SystemTrack['eoInvestigationStatus'],
  ): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    track.eoInvestigationStatus = status;
  }

  // ── Missed update ─────────────────────────────────────────────────────────

  missedUpdate(trackId: SystemTrackId): SystemTrack {
    const track = this.tracks.get(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    const meta = this.meta.get(trackId)!;
    meta.missCount++;

    if (meta.missCount >= this.config.dropAfterMisses) {
      track.status = 'dropped';
      track.lineage = [
        ...track.lineage,
        createLineageEntry(
          'track.dropped',
          `Dropped after ${meta.missCount} consecutive missed updates`,
        ),
      ];
    }

    return track;
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  /**
   * Process an observation through the full pipeline: normalise, correlate,
   * fuse, and emit events.
   *
   * @param observation  The incoming source observation.
   * @param registrationHealth  Optional registration health for the
   *   observation's sensor.  When provided **and** the sensor is marked
   *   unsafe, fusion switches to confirmation-only mode.
   */
  processObservation(
    observation: SourceObservation,
    registrationHealth?: RegistrationState,
  ): ProcessObservationResult {
    // 1. Normalize
    const normalized = normalizeObservation(observation);

    // 2. Correlate against non-dropped tracks
    const activeTracks = this.getAllTracks().filter((t) => t.status !== 'dropped');
    const correlationResult = correlate(normalized, activeTracks, this.correlatorConfig);

    // 3. Build correlation event
    const correlationEnvelope = createEventEnvelope(
      'correlation.decided',
      'fusion-core',
      'track-manager',
    );
    const correlationEvent: CorrelationDecided = {
      ...correlationEnvelope,
      eventType: 'correlation.decided',
      sourceReferences: [normalized.observationId],
      data: {
        observationId: normalized.observationId,
        candidateSystemTrackIds: correlationResult.candidates.map((c) => c.trackId),
        selectedTrackId: correlationResult.selectedTrackId,
        decision: correlationResult.decision,
        score: correlationResult.score,
        method: correlationResult.method,
        evidence: {
          candidates: correlationResult.candidates,
        },
      },
    };

    let track: SystemTrack;
    let previousState: Position3D;

    if (correlationResult.decision === 'new_track') {
      // 4a. Create new track
      track = this.createTrack(normalized, correlationResult);
      previousState = { ...track.state }; // same as new state for creation
    } else {
      // 4b. Fuse into existing track (registration-aware)
      const existingTrack = this.tracks.get(correlationResult.selectedTrackId!)!;
      previousState = { ...existingTrack.state };

      const fusedState = fuseWithRegistration(
        normalized,
        existingTrack,
        registrationHealth,
      );
      track = this.updateTrack(
        correlationResult.selectedTrackId!,
        fusedState,
        normalized,
      );
    }

    // 5. Build system track updated event
    const trackEnvelope = createEventEnvelope(
      'system.track.updated',
      'fusion-core',
      'track-manager',
    );

    const fusionMethod =
      correlationResult.decision === 'new_track'
        ? 'init'
        : registrationHealth && !registrationHealth.fusionSafe
          ? 'confirmation_only'
          : 'information_matrix';

    const trackEvent: SystemTrackUpdated = {
      ...trackEnvelope,
      eventType: 'system.track.updated',
      sourceReferences: [normalized.observationId, track.systemTrackId],
      data: {
        systemTrackId: track.systemTrackId,
        previousState,
        newState: { ...track.state },
        fusionMethod,
        sourcesUsed: [...track.sources],
        confidenceChange:
          correlationResult.decision === 'new_track'
            ? track.confidence
            : track.confidence - (previousState ? 0 : 0), // delta captured in fuser
      },
    };

    return {
      track,
      event: trackEvent,
      correlationEvent,
    };
  }

  // ── Batch processing ────────────────────────────────────────────────────

  /**
   * Process a batch of observations from a single tick.
   *
   * Groups spatially close observations (within clusterRadiusM) into clusters.
   * Creates one track per cluster from the first observation, then correlates
   * remaining observations against the new tracks. This prevents ghost tracks
   * when multiple sensors report the same target simultaneously.
   */
  processObservationBatch(
    observations: SourceObservation[],
    registrationHealthMap?: Map<string, RegistrationState>,
  ): ProcessObservationResult[] {
    if (observations.length === 0) return [];

    // ALWAYS cluster observations spatially, regardless of whether tracks exist.
    // This prevents multiple sensors reporting the same target from creating
    // separate tracks when processed individually.
    const clusters = this.clusterObservations(observations, 5000); // 5km radius

    const results: ProcessObservationResult[] = [];
    for (const cluster of clusters) {
      // Try to correlate the cluster against existing tracks using the first member
      const firstNormalized = normalizeObservation(cluster[0]);
      const activeTracks = this.getAllTracks().filter(t => t.status !== 'dropped');
      const correlationResult = correlate(firstNormalized, activeTracks, this.correlatorConfig);

      if (correlationResult.decision === 'associated') {
        // Match found: fuse ALL cluster members into the matched track sequentially
        for (const obs of cluster) {
          const health = registrationHealthMap?.get(obs.sensorId as string);
          results.push(this.processObservation(obs, health));
        }
      } else {
        // No match: create a new track from the first observation,
        // then fuse remaining members into it
        const health0 = registrationHealthMap?.get(cluster[0].sensorId as string);
        results.push(this.processObservation(cluster[0], health0));

        for (let i = 1; i < cluster.length; i++) {
          const health = registrationHealthMap?.get(cluster[i].sensorId as string);
          results.push(this.processObservation(cluster[i], health));
        }
      }
    }

    // Post-sweep safety net: merge any tracks that ended up too close
    this.mergeCloseTracks();

    return results;
  }

  /**
   * Simple spatial clustering: group observations within radiusM of each other.
   */
  private clusterObservations(observations: SourceObservation[], radiusM: number): SourceObservation[][] {
    const assigned = new Set<number>();
    const clusters: SourceObservation[][] = [];

    for (let i = 0; i < observations.length; i++) {
      if (assigned.has(i)) continue;

      const cluster: SourceObservation[] = [observations[i]];
      assigned.add(i);

      for (let j = i + 1; j < observations.length; j++) {
        if (assigned.has(j)) continue;
        const dist = haversineDistanceM(
          observations[i].position.lat, observations[i].position.lon,
          observations[j].position.lat, observations[j].position.lon,
        );
        if (dist <= radiusM) {
          cluster.push(observations[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  // ── Post-tick merge sweep ───────────────────────────────────────────────

  /**
   * Scan all non-dropped tracks and merge pairs that are within maxDistM.
   * Called after each tick to clean up duplicate tracks that slipped through
   * the correlation gate. Returns the number of merges performed.
   */
  mergeCloseTracks(maxDistM?: number): number {
    const effectiveMaxDist = maxDistM ?? this.mergeDistanceM;
    let mergeCount = 0;
    let merged = true;

    while (merged) {
      merged = false;
      const active = this.getAllTracks().filter(t => t.status !== 'dropped');

      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const dist = haversineDistanceM(
            active[i].state.lat, active[i].state.lon,
            active[j].state.lat, active[j].state.lon,
          );
          if (dist <= effectiveMaxDist) {
            this.mergeTracks(active[i].systemTrackId, active[j].systemTrackId);
            mergeCount++;
            merged = true;
            break; // restart scan since track list changed
          }
        }
        if (merged) break;
      }
    }

    return mergeCount;
  }
}
