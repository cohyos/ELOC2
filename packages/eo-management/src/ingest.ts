import type { SystemTrack, SensorState } from '@eloc2/domain';
import type { IngestConfig } from './types.js';
import { DEFAULT_INGEST_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Track Ingester
// ---------------------------------------------------------------------------

/**
 * Filters and prioritises incoming tracks for EO processing.
 *
 * Tracks are ranked by a simple priority score that accounts for:
 *   1. Track confidence (lower = higher need for EO)
 *   2. Whether the track already has EO investigation
 *   3. Track status (confirmed tracks get lower priority than tentative)
 */
export class TrackIngester {
  private config: IngestConfig;

  constructor(config: Partial<IngestConfig> = {}) {
    this.config = { ...DEFAULT_INGEST_CONFIG, ...config };
  }

  /**
   * Filter tracks eligible for EO processing and sort by priority (highest first).
   */
  filter(tracks: SystemTrack[]): SystemTrack[] {
    return tracks
      .filter(t => this.isEligible(t))
      .sort((a, b) => this.priorityScore(b) - this.priorityScore(a));
  }

  /**
   * Return only EO sensors that are online.
   */
  filterEoSensors(sensors: SensorState[]): SensorState[] {
    return sensors.filter(s => s.sensorType === 'eo' && s.online);
  }

  private isEligible(track: SystemTrack): boolean {
    if (this.config.excludeStatuses.includes(track.status)) return false;
    if (!this.config.includeTentative && track.status === 'tentative') return false;
    if (track.confidence < this.config.minConfidence) return false;
    // Skip tracks already fully confirmed by EO
    if (track.eoInvestigationStatus === 'confirmed') return false;
    return true;
  }

  private priorityScore(track: SystemTrack): number {
    let score = 0;
    // Lower confidence = more need for EO investigation
    score += (1 - track.confidence) * 30;
    // Tentative tracks need more attention
    if (track.status === 'tentative') score += 20;
    // Tracks not yet investigated get a boost
    if (track.eoInvestigationStatus === 'none' || track.eoInvestigationStatus === 'pending') {
      score += 15;
    }
    // Tracks in progress get moderate priority
    if (track.eoInvestigationStatus === 'in_progress') score += 5;
    return score;
  }
}
