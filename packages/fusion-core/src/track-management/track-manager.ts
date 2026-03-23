import type {
  Covariance3x3,
  MotionModelStatus,
  Position3D,
  RegistrationState,
  SensorId,
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  Timestamp,
} from '@eloc2/domain';
import { createLineageEntry, createDefaultTrackQuality } from '@eloc2/domain';
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
import {
  updateExistenceOnDetection,
  updateExistenceOnMiss,
} from './existence-calculator.js';
import { ConsistencyEvaluator } from './consistency-evaluator.js';
import type { ConsistencyResult } from './consistency-evaluator.js';
import type { AssociationMode } from '../association/association-selector.js';
import {
  type TargetCategory,
  type ClassifierState,
  type CategoryProfile,
  createClassifierState,
  updateClassifier,
  getProfile,
  DEFAULT_PROFILE,
  BM_PROFILE,
  ABT_PROFILE,
} from './target-category-profiles.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TrackManagerConfig {
  /** Number of consistent updates required to confirm a tentative track. */
  confirmAfter: number;
  /** Number of consecutive misses before a track is dropped. */
  dropAfterMisses: number;

  // --- Enhanced existence-based lifecycle ---

  /** Enable Bayesian existence probability tracking. Default false (legacy mode). */
  enableExistence?: boolean;
  /** Existence probability to promote candidate to tentative. */
  existencePromotionThreshold?: number;
  /** Existence probability to promote tentative to confirmed. */
  existenceConfirmationThreshold?: number;
  /** Existence probability below which track is dropped. */
  existenceDeletionThreshold?: number;
  /** Miss count to enter coasting state. */
  coastingMissThreshold?: number;
  /** Sensor probability of detection. */
  pDetection?: number;
  /** Per-gate false alarm probability. */
  pFalseAlarm?: number;
  /** Max coasting time before forced drop (seconds). */
  maxCoastingTimeSec?: number;

  // --- Association mode ---

  /** Association algorithm: 'nn' (default), 'jpda', or 'auto'. */
  associationMode?: AssociationMode;

  // --- IMM ---

  /** Enable Interacting Multiple Model filter. */
  enableIMM?: boolean;

  // --- TBD ---

  /** Enable Track-Before-Detect. */
  enableTBD?: boolean;
}

const DEFAULT_CONFIG: TrackManagerConfig = {
  confirmAfter: 3,
  dropAfterMisses: 5,
  enableExistence: false,
  existencePromotionThreshold: 0.5,
  existenceConfirmationThreshold: 0.8,
  existenceDeletionThreshold: 0.1,
  coastingMissThreshold: 3,
  pDetection: 0.9,
  pFalseAlarm: 0.01,
  maxCoastingTimeSec: 15,
  associationMode: 'nn',
  enableIMM: false,
  enableTBD: false,
};

// ---------------------------------------------------------------------------
// Internal bookkeeping per track
// ---------------------------------------------------------------------------

interface TrackMeta {
  updateCount: number;
  missCount: number;
  /** Bayesian existence probability (when enableExistence is true). */
  existenceProbability: number;
  /** Rolling window of hit/miss (true=hit) for quality computation. */
  rollingSupportWindow: boolean[];
  /** Active motion model. */
  motionModelStatus: MotionModelStatus;
  /** Dual-hypothesis BM/ABT classifier state. */
  classifierState: ClassifierState;
  /** Resolved target category (drives parameter profile). */
  targetCategory: TargetCategory;
  /** Tick counter when track was last updated (for tick-based stale detection). */
  lastUpdateTick: number;
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
  private correlatorConfig: CorrelatorConfig = { gateThreshold: 20.0, velocityGateThreshold: 75 };
  private mergeDistanceM: number = 8000;

  /** 6DOF consistency evaluator — tracks position/velocity/acceleration/Doppler consistency. */
  readonly consistencyEvaluator = new ConsistencyEvaluator();

  /** Per-track consistency evaluators keyed by category for dual-hypothesis. */
  private readonly categoryEvaluators: Map<string, ConsistencyEvaluator> = new Map();

  /** Enable dual-hypothesis BM/ABT tracking. */
  enableDualHypothesis: boolean = false;

  constructor(config: Partial<TrackManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Dual-hypothesis helpers ─────────────────────────────────────────

  /**
   * Get the resolved target category for a track.
   * Returns 'unresolved' if dual-hypothesis is disabled or not yet resolved.
   */
  getTrackCategory(trackId: SystemTrackId | string): TargetCategory {
    const meta = this.meta.get(trackId as string);
    return meta?.targetCategory ?? 'unresolved';
  }

  /**
   * Get the active parameter profile for a track based on its resolved category.
   */
  getTrackProfile(trackId: SystemTrackId | string): CategoryProfile {
    if (!this.enableDualHypothesis) return DEFAULT_PROFILE;
    return getProfile(this.getTrackCategory(trackId));
  }

  /**
   * Get the classifier state for a track (for diagnostics/UI display).
   */
  getClassifierState(trackId: SystemTrackId | string): ClassifierState | undefined {
    return this.meta.get(trackId as string)?.classifierState;
  }

  /**
   * Get the effective correlator config for correlating against a specific track.
   * When dual-hypothesis is enabled and the track has a resolved category,
   * uses the category-specific gate. Otherwise uses the wider default gate.
   */
  private getEffectiveCorrelatorConfig(track: SystemTrack): CorrelatorConfig {
    if (!this.enableDualHypothesis) return this.correlatorConfig;

    const meta = this.meta.get(track.systemTrackId as string);
    if (!meta) return this.correlatorConfig;

    // For unresolved tracks, use the wider DEFAULT_PROFILE gate to allow
    // both BM and ABT observations to correlate during early detection
    const profile = getProfile(meta.targetCategory);
    return profile.correlator;
  }

  /**
   * Update the dual-hypothesis classifier for a track after a new observation.
   * Computes speed and climb angle from the track's velocity.
   */
  private updateTrackClassifier(trackId: string, track: SystemTrack): void {
    const meta = this.meta.get(trackId);
    if (!meta || !this.enableDualHypothesis) return;
    if (meta.classifierState.resolved !== 'unresolved') return; // already committed

    if (!track.velocity) return;

    const vx = track.velocity.vx ?? 0;
    const vy = track.velocity.vy ?? 0;
    const vz = track.velocity.vz ?? 0;
    const horizontalSpeed = Math.sqrt(vx * vx + vy * vy);
    const totalSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);

    // Climb angle: atan2(vertical, horizontal) in degrees
    const climbAngleDeg = Math.atan2(Math.abs(vz), horizontalSpeed) * (180 / Math.PI);

    // Estimate acceleration from consistency evaluator snapshot
    let accelMag: number | undefined;
    const snapshot = this.consistencyEvaluator.getSnapshot(trackId);
    if (snapshot?.acceleration) {
      const { ax, ay, az } = snapshot.acceleration;
      accelMag = Math.sqrt(ax * ax + ay * ay + az * az);
    }

    const prevCategory = meta.classifierState.resolved;
    meta.classifierState = updateClassifier(
      meta.classifierState,
      totalSpeed,
      climbAngleDeg,
      accelMag,
    );

    // If just resolved, apply the category-specific consistency config
    if (meta.classifierState.resolved !== 'unresolved' && prevCategory === 'unresolved') {
      meta.targetCategory = meta.classifierState.resolved;
      const profile = getProfile(meta.targetCategory);
      // Reconfigure consistency evaluator for this track with category-specific params
      // (the evaluator uses per-call config override, but we update the track's profile)
      track.lineage = [
        ...track.lineage,
        createLineageEntry(
          'track.classified',
          `Category resolved: ${meta.targetCategory.toUpperCase()} (BM=${meta.classifierState.bmScore.toFixed(2)}, ABT=${meta.classifierState.abtScore.toFixed(2)})`,
        ),
      ];
    }
  }

  /**
   * Compute the effective correlator config for a set of tracks.
   * Uses the widest gate needed among all track categories present.
   * This ensures BM tracks (wide gate) don't miss correlations while
   * ABT tracks (tight gate) still benefit from tight gating.
   */
  private computeEffectiveCorrelatorConfig(activeTracks: SystemTrack[]): CorrelatorConfig {
    let maxGate = this.correlatorConfig.gateThreshold;
    let maxVelGate = this.correlatorConfig.velocityGateThreshold;

    for (const track of activeTracks) {
      const profile = this.getTrackProfile(track.systemTrackId);
      maxGate = Math.max(maxGate, profile.correlator.gateThreshold);
      maxVelGate = Math.max(maxVelGate, profile.correlator.velocityGateThreshold);
    }

    return { gateThreshold: maxGate, velocityGateThreshold: maxVelGate };
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
      // Use observation timestamp (simulation time) for consistent prediction in correlator.
      // Date.now() diverges from simulation time at >1x playback speed, causing
      // prediction dt overflow and correlation gate failures (track proliferation).
      lastUpdated: observation.timestamp,
      sources: [observation.sensorId],
      eoInvestigationStatus: 'none',
      radialVelocity: observation.radialVelocity,
      dopplerQuality: observation.dopplerQuality,
    };

    this.tracks.set(id, track);
    this.meta.set(id, {
      updateCount: 1,
      missCount: 0,
      existenceProbability: 0.3,
      rollingSupportWindow: [true],
      motionModelStatus: 'unknown',
      classifierState: createClassifierState(),
      targetCategory: 'unresolved',
      lastUpdateTick: 0,
    });

    // If existence tracking is enabled, set initial existence probability on track
    if (this.config.enableExistence) {
      track.existenceProbability = 0.3;
      track.trackQuality = createDefaultTrackQuality();
      track.motionModelStatus = 'unknown';
    }

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
    // Use observation timestamp for consistent prediction at any playback speed
    track.lastUpdated = observation.timestamp;

    // Propagate Doppler from fused state
    if (fusedState.radialVelocity !== undefined) {
      track.radialVelocity = fusedState.radialVelocity;
    }
    if (fusedState.dopplerQuality !== undefined) {
      track.dopplerQuality = fusedState.dopplerQuality;
    }

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
    meta.rollingSupportWindow.push(true);
    if (meta.rollingSupportWindow.length > 10) meta.rollingSupportWindow.shift();

    if (this.config.enableExistence) {
      // Bayesian existence update on detection
      meta.existenceProbability = updateExistenceOnDetection(
        meta.existenceProbability,
        this.config.pDetection ?? 0.9,
        this.config.pFalseAlarm ?? 0.01,
      );
      track.existenceProbability = meta.existenceProbability;
      track.confidence = meta.existenceProbability;

      // Existence-based promotion
      const promoteThreshold = this.config.existencePromotionThreshold ?? 0.5;
      const confirmThreshold = this.config.existenceConfirmationThreshold ?? 0.8;

      if (
        (track.status === 'candidate' || track.status === 'coasting') &&
        meta.existenceProbability >= promoteThreshold
      ) {
        track.status = 'tentative';
        track.lineage = [
          ...track.lineage,
          createLineageEntry(
            'track.promoted',
            `Promoted to tentative (Pe=${meta.existenceProbability.toFixed(3)})`,
          ),
        ];
      }

      if (track.status === 'tentative' && meta.existenceProbability >= confirmThreshold) {
        track.status = 'confirmed';
        track.lineage = [
          ...track.lineage,
          createLineageEntry(
            'track.confirmed',
            `Confirmed via existence probability (Pe=${meta.existenceProbability.toFixed(3)})`,
          ),
        ];
      }
    } else {
      // Legacy hit-count confirmation
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
    }

    // ── 6DOF Consistency evaluation ──
    // Compare current state against predicted state from previous cycle.
    // Adjusts confidence based on position/velocity/acceleration/Doppler consistency.
    const consistencyResult = this.consistencyEvaluator.evaluate(
      trackId as string,
      track.state,
      observation.velocity ?? track.velocity,
      observation.timestamp as number,
      track.radialVelocity,
    );
    if (consistencyResult) {
      track.confidence = Math.max(0, Math.min(1, track.confidence + consistencyResult.certaintyDelta));
      meta.existenceProbability = track.confidence;
    }

    // ── Dual-hypothesis BM/ABT classification ──
    // Update velocity/trajectory classifier after each observation.
    // In early detection (unresolved), both hypotheses compete.
    // Once resolved, the track's parameter profile is locked to BM or ABT.
    this.updateTrackClassifier(trackId as string, track);

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

    // Clean up consistency tracking
    this.consistencyEvaluator.removeTrack(trackId as string);

    return track;
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  mergeTracks(trackId1: SystemTrackId, trackId2: SystemTrackId): SystemTrack {
    const track1 = this.tracks.get(trackId1);
    const track2 = this.tracks.get(trackId2);

    if (!track1) throw new Error(`Track ${trackId1} not found`);
    if (!track2) throw new Error(`Track ${trackId2} not found`);

    const newId = generateId() as SystemTrackId;

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
      // Use the most recent observation-based timestamp from the primary track,
      // NOT Date.now(). Using wall-clock time corrupts the correlator's prediction
      // dt calculation (obs.timestamp - track.lastUpdated), causing prediction to
      // be skipped or wildly wrong at >1x playback speed → ghost track proliferation.
      lastUpdated: Math.max(track1.lastUpdated, track2.lastUpdated) as Timestamp,
      sources,
      eoInvestigationStatus: 'none',
      radialVelocity: primary.radialVelocity,
      dopplerQuality: primary.dopplerQuality,
    };

    // Drop old tracks
    track1.status = 'dropped';
    track2.status = 'dropped';

    this.tracks.set(newId, mergedTrack);

    // Combine meta
    const meta1 = this.meta.get(trackId1);
    const meta2 = this.meta.get(trackId2);
    // Inherit the resolved category from the higher-confidence track
    const primaryMeta = (track1.confidence >= track2.confidence ? meta1 : meta2) ?? meta1;
    this.meta.set(newId, {
      updateCount: (meta1?.updateCount ?? 0) + (meta2?.updateCount ?? 0),
      missCount: 0,
      existenceProbability: Math.max(
        meta1?.existenceProbability ?? 0.3,
        meta2?.existenceProbability ?? 0.3,
      ),
      rollingSupportWindow: [
        ...(meta1?.rollingSupportWindow ?? []),
        ...(meta2?.rollingSupportWindow ?? []),
      ].slice(-10),
      motionModelStatus: meta1?.motionModelStatus ?? 'unknown',
      classifierState: primaryMeta?.classifierState ?? createClassifierState(),
      targetCategory: primaryMeta?.targetCategory ?? 'unresolved',
      lastUpdateTick: Math.max(meta1?.lastUpdateTick ?? 0, meta2?.lastUpdateTick ?? 0),
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

  /**
   * Inject an externally created system track (e.g. from EO triangulation).
   * The track is registered with default metadata so it participates in
   * normal maintenance (miss-counting, merging, dropping).
   */
  injectTrack(track: SystemTrack): void {
    this.tracks.set(track.systemTrackId, track);
    this.meta.set(track.systemTrackId, {
      updateCount: 1,
      missCount: 0,
      existenceProbability: track.confidence,
      rollingSupportWindow: [true],
      motionModelStatus: 'unknown',
      classifierState: createClassifierState(),
      targetCategory: 'unresolved',
      lastUpdateTick: 0,
    });
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
    meta.rollingSupportWindow.push(false);
    if (meta.rollingSupportWindow.length > 10) meta.rollingSupportWindow.shift();

    if (this.config.enableExistence) {
      // Bayesian existence decay on miss
      meta.existenceProbability = updateExistenceOnMiss(
        meta.existenceProbability,
        this.config.pDetection ?? 0.9,
        this.config.pFalseAlarm ?? 0.01,
      );
      track.existenceProbability = meta.existenceProbability;
      track.confidence = meta.existenceProbability;

      const coastThreshold = this.config.coastingMissThreshold ?? 3;
      const deleteThreshold = this.config.existenceDeletionThreshold ?? 0.1;

      // Transition to coasting
      if (
        meta.missCount >= coastThreshold &&
        track.status === 'confirmed'
      ) {
        track.status = 'coasting';
        track.lineage = [
          ...track.lineage,
          createLineageEntry(
            'track.coasting',
            `Coasting after ${meta.missCount} misses (Pe=${meta.existenceProbability.toFixed(3)})`,
          ),
        ];
      }

      // Enforce maxCoastingTimeSec: drop tracks that have been coasting too long
      const maxCoastingSec = this.config.maxCoastingTimeSec ?? 15;
      if (track.status === 'coasting' && meta.missCount > (coastThreshold + maxCoastingSec)) {
        track.status = 'dropped';
        track.lineage = [
          ...track.lineage,
          createLineageEntry(
            'track.dropped',
            `Dropped: coasting exceeded max ${maxCoastingSec}s (${meta.missCount} misses)`,
          ),
        ];
      }

      // Transition to dropped on low existence probability
      if (meta.existenceProbability < deleteThreshold) {
        track.status = 'dropped';
        track.lineage = [
          ...track.lineage,
          createLineageEntry(
            'track.dropped',
            `Dropped: existence probability ${meta.existenceProbability.toFixed(3)} below threshold ${deleteThreshold}`,
          ),
        ];
      }
    } else {
      // Legacy miss-count drop
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
    // When dual-hypothesis is enabled, build per-track gate configs so each
    // track uses its own category-specific gate (BM=wide, ABT=tight) instead
    // of inflating all tracks to the widest gate.
    const activeTracks = this.getAllTracks().filter((t) => t.status !== 'dropped');
    let perTrackConfig: Map<string, CorrelatorConfig> | undefined;
    if (this.enableDualHypothesis) {
      perTrackConfig = new Map();
      for (const track of activeTracks) {
        perTrackConfig.set(track.systemTrackId as string, this.getEffectiveCorrelatorConfig(track));
      }
    }
    const correlationResult = correlate(normalized, activeTracks, this.correlatorConfig, perTrackConfig);

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
      let batchPerTrackConfig: Map<string, CorrelatorConfig> | undefined;
      if (this.enableDualHypothesis) {
        batchPerTrackConfig = new Map();
        for (const track of activeTracks) {
          batchPerTrackConfig.set(track.systemTrackId as string, this.getEffectiveCorrelatorConfig(track));
        }
      }
      const correlationResult = correlate(firstNormalized, activeTracks, this.correlatorConfig, batchPerTrackConfig);

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

  // ── Tick-based stale detection ────────────────────────────────────────

  /**
   * Mark all active tracks that were NOT updated in the current tick as missed.
   * This is playback-speed-independent (unlike timestamp-based approaches where
   * Date.now() diverges from simulation timestamps at >1x speed).
   *
   * Call this once per tick AFTER processing all observations.
   * @param currentTick — monotonic tick counter (e.g., elapsedSec).
   * @param graceTicksCount — number of ticks a track can miss before getting
   *   a missedUpdate call. Default 2 (allows intermittent radar misses).
   */
  markStaleTracksAsMissed(currentTick: number, graceTicksCount: number = 2): void {
    const active = this.getAllTracks().filter(t => t.status !== 'dropped');
    for (const track of active) {
      const meta = this.meta.get(track.systemTrackId as string);
      if (!meta) continue;
      const ticksSinceUpdate = currentTick - meta.lastUpdateTick;
      if (ticksSinceUpdate > graceTicksCount) {
        try {
          this.missedUpdate(track.systemTrackId);
        } catch (_) {
          // Track may have been dropped or merged
        }
      }
    }
  }

  /**
   * Record that a track was updated in the given tick.
   */
  setTrackUpdateTick(trackId: SystemTrackId | string, tick: number): void {
    const meta = this.meta.get(trackId as string);
    if (meta) {
      meta.lastUpdateTick = tick;
    }
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
