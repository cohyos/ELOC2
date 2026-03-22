/**
 * Track-Before-Detect (TBD) Manager.
 *
 * Accumulates evidence for weak targets across multiple scans before
 * formally initiating them as system tracks.
 */

import type {
  Covariance3x3,
  Position3D,
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  Timestamp,
} from '@eloc2/domain';
import { createLineageEntry, createDefaultTrackQuality } from '@eloc2/domain';
import { generateId, haversineDistanceM } from '@eloc2/shared-utils';
import { type TBDCandidate, createTBDCandidate } from './tbd-candidate.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TBDConfig {
  /** Cumulative LLR threshold to promote to a system track. */
  initiationLLRThreshold: number;
  /** Cumulative LLR threshold below which candidate is pruned. */
  deletionLLRThreshold: number;
  /** Maximum age in seconds before pruning. */
  maxCandidateAgeSec: number;
  /** SNR below which an observation is considered "weak". */
  lowSnrThreshold: number;
  /** Maximum association distance in meters. */
  associationRadiusM: number;
  /** LLR increment per hit. */
  hitLLR: number;
  /** LLR decrement per miss (negative). */
  missLLR: number;
}

export const DEFAULT_TBD_CONFIG: TBDConfig = {
  initiationLLRThreshold: 5.0,
  deletionLLRThreshold: -3.0,
  maxCandidateAgeSec: 30,
  lowSnrThreshold: 10,
  associationRadiusM: 5000,
  hitLLR: 1.5,
  missLLR: -1.0,
};

// ---------------------------------------------------------------------------
// TBD Manager
// ---------------------------------------------------------------------------

export class TBDManager {
  readonly candidates: Map<string, TBDCandidate> = new Map();
  private readonly config: TBDConfig;

  constructor(config: Partial<TBDConfig> = {}) {
    this.config = { ...DEFAULT_TBD_CONFIG, ...config };
  }

  /**
   * Ingest observations that were not claimed by the main association pipeline.
   *
   * For each observation:
   * 1. Try to associate with an existing TBD candidate
   * 2. If no match, create a new candidate
   */
  ingestUnassociatedObservations(observations: SourceObservation[]): void {
    for (const obs of observations) {
      let matched = false;

      for (const candidate of this.candidates.values()) {
        const dist = haversineDistanceM(
          candidate.position.lat, candidate.position.lon,
          obs.position.lat, obs.position.lon,
        );

        if (dist <= this.config.associationRadiusM) {
          // Update candidate
          candidate.observations.push(obs);
          candidate.scanCount++;
          candidate.hitCount++;
          candidate.cumulativeLLR += this.config.hitLLR;
          candidate.lastUpdated = Date.now() as Timestamp;

          // Update position (simple average)
          const n = candidate.hitCount;
          candidate.position = {
            lat: candidate.position.lat + (obs.position.lat - candidate.position.lat) / n,
            lon: candidate.position.lon + (obs.position.lon - candidate.position.lon) / n,
            alt: candidate.position.alt + (obs.position.alt - candidate.position.alt) / n,
          };

          // Update velocity if available
          if (obs.velocity) {
            candidate.velocity = { ...obs.velocity };
          }

          matched = true;
          break;
        }
      }

      if (!matched) {
        const candidate = createTBDCandidate(obs);
        candidate.cumulativeLLR = this.config.hitLLR;
        this.candidates.set(candidate.id, candidate);
      }
    }
  }

  /**
   * Apply a miss to all candidates that were not updated this scan.
   *
   * @param updatedCandidateIds Set of candidate IDs that received observations this scan.
   */
  applyMisses(updatedCandidateIds: Set<string>): void {
    for (const [id, candidate] of this.candidates) {
      if (!updatedCandidateIds.has(id)) {
        candidate.scanCount++;
        candidate.cumulativeLLR += this.config.missLLR;
      }
    }
  }

  /**
   * Promote candidates whose LLR exceeds the initiation threshold.
   *
   * @returns Array of system tracks created from promoted candidates.
   */
  promoteCandidates(): SystemTrack[] {
    const promoted: SystemTrack[] = [];

    for (const [id, candidate] of this.candidates) {
      if (candidate.cumulativeLLR >= this.config.initiationLLRThreshold) {
        const track = this.candidateToTrack(candidate);
        promoted.push(track);
        this.candidates.delete(id);
      }
    }

    return promoted;
  }

  /**
   * Prune candidates whose LLR drops below deletion threshold or who have aged out.
   *
   * @returns IDs of pruned candidates.
   */
  pruneCandidates(): string[] {
    const pruned: string[] = [];
    const now = Date.now();

    for (const [id, candidate] of this.candidates) {
      const ageSec = (now - (candidate.createdAt as number)) / 1000;

      if (
        candidate.cumulativeLLR <= this.config.deletionLLRThreshold ||
        ageSec >= this.config.maxCandidateAgeSec
      ) {
        pruned.push(id);
        this.candidates.delete(id);
      }
    }

    return pruned;
  }

  /**
   * Run a full TBD tick: promote, then prune.
   */
  tick(): { promoted: SystemTrack[]; pruned: string[] } {
    const promoted = this.promoteCandidates();
    const pruned = this.pruneCandidates();
    return { promoted, pruned };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private candidateToTrack(candidate: TBDCandidate): SystemTrack {
    const id = generateId() as SystemTrackId;
    const now = Date.now() as Timestamp;

    const sources = [...new Set(candidate.observations.map(o => o.sensorId))];

    return {
      systemTrackId: id,
      state: { ...candidate.position },
      velocity: candidate.velocity ? { ...candidate.velocity } : undefined,
      covariance: candidate.covariance.map(row => [...row]) as Covariance3x3,
      confidence: 0.4, // moderate confidence from TBD
      status: 'tentative',
      lineage: [
        createLineageEntry(
          'track.created',
          `Promoted from TBD candidate ${candidate.id} (${candidate.hitCount} hits, LLR=${candidate.cumulativeLLR.toFixed(2)})`,
        ),
      ],
      lastUpdated: now,
      sources,
      eoInvestigationStatus: 'none',
      existenceProbability: 0.5,
      trackQuality: createDefaultTrackQuality(),
    };
  }
}
