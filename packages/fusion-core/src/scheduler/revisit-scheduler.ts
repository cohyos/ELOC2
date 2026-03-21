/**
 * Phased-array adaptive revisit scheduler.
 *
 * Determines per-track revisit intervals based on predicted error growth,
 * threat priority, and beam cost.
 */

import type { SystemTrack, SystemTrackId, Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevisitPriority {
  trackId: string;
  priority: number;
  plannedNextUpdateTime: number; // ms since epoch
  covarianceGrowthRate: number;
  beamCost: number;
}

export interface RevisitSchedule {
  trackId: string;
  revisitIntervalMs: number;
  nextUpdateTime: number;
}

export interface RevisitConfig {
  /** Minimum revisit interval in ms. */
  minRevisitMs: number;
  /** Maximum revisit interval in ms. */
  maxRevisitMs: number;
  /** Base revisit interval in ms. */
  baseRevisitMs: number;
  /** Weight for covariance growth in priority. */
  covGrowthWeight: number;
  /** Weight for threat classification in priority. */
  threatWeight: number;
  /** Weight for track status (coasting gets higher priority). */
  statusWeight: number;
}

export const DEFAULT_REVISIT_CONFIG: RevisitConfig = {
  minRevisitMs: 500,
  maxRevisitMs: 10000,
  baseRevisitMs: 3000,
  covGrowthWeight: 0.4,
  threatWeight: 0.3,
  statusWeight: 0.3,
};

// ---------------------------------------------------------------------------
// Threat scores by classification
// ---------------------------------------------------------------------------

const THREAT_SCORES: Record<string, number> = {
  missile: 1.0,
  rocket: 0.9,
  fighter_aircraft: 0.8,
  uav: 0.7,
  drone: 0.7,
  small_uav: 0.6,
  helicopter: 0.5,
  unknown: 0.5,
  civilian_aircraft: 0.2,
  passenger_aircraft: 0.1,
  light_aircraft: 0.1,
  bird: 0.05,
  birds: 0.05,
  neutral: 0.1,
  ally: 0.1,
  predator: 0.8,
};

// ---------------------------------------------------------------------------
// Revisit scheduler
// ---------------------------------------------------------------------------

/**
 * Compute revisit priority for a single track.
 */
export function computeRevisitPriority(
  track: SystemTrack,
  config: RevisitConfig = DEFAULT_REVISIT_CONFIG,
): RevisitPriority {
  // Covariance growth rate: trace of covariance as proxy
  const covTrace = track.covariance[0][0] + track.covariance[1][1] + track.covariance[2][2];
  const covGrowthRate = Math.min(1, covTrace / 1000); // normalize

  // Threat score
  const threatScore = THREAT_SCORES[track.classification ?? 'unknown'] ?? 0.5;

  // Status score: coasting tracks need attention
  let statusScore = 0.3;
  if (track.status === 'coasting') statusScore = 1.0;
  else if (track.status === 'tentative' || track.status === 'candidate') statusScore = 0.7;
  else if (track.status === 'confirmed') statusScore = 0.3;

  // Combined priority
  const priority =
    config.covGrowthWeight * covGrowthRate +
    config.threatWeight * threatScore +
    config.statusWeight * statusScore;

  // Revisit interval: higher priority → shorter interval
  const intervalMs = Math.max(
    config.minRevisitMs,
    Math.min(
      config.maxRevisitMs,
      config.baseRevisitMs * (1 - priority * 0.8),
    ),
  );

  const now = Date.now();
  const plannedNext = (track.lastUpdated as number) + intervalMs;

  return {
    trackId: track.systemTrackId as string,
    priority,
    plannedNextUpdateTime: plannedNext,
    covarianceGrowthRate: covGrowthRate,
    beamCost: 1, // simplified: 1 beam per dwell
  };
}

/**
 * Schedule revisits for all tracks, allocating beam time proportionally.
 *
 * @param tracks Active system tracks.
 * @param availableBeamTimeMs Total available beam time per scan (ms).
 * @param config Revisit configuration.
 * @returns Scheduled revisit intervals for each track.
 */
export function scheduleRevisits(
  tracks: SystemTrack[],
  availableBeamTimeMs: number = 10000,
  config: RevisitConfig = DEFAULT_REVISIT_CONFIG,
): RevisitSchedule[] {
  if (tracks.length === 0) return [];

  const priorities = tracks.map(t => computeRevisitPriority(t, config));
  const totalPriority = priorities.reduce((s, p) => s + p.priority, 0);

  return priorities.map(p => {
    const share = totalPriority > 0 ? p.priority / totalPriority : 1 / tracks.length;
    const allocatedTimeMs = share * availableBeamTimeMs;

    // More allocated time → shorter interval
    const revisitIntervalMs = Math.max(
      config.minRevisitMs,
      Math.min(config.maxRevisitMs, config.baseRevisitMs / (share * tracks.length + 0.1)),
    );

    return {
      trackId: p.trackId,
      revisitIntervalMs,
      nextUpdateTime: p.plannedNextUpdateTime,
    };
  });
}
