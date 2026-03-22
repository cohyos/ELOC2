/**
 * Track-Before-Detect (TBD) candidate.
 *
 * Represents a potential target that has not yet accumulated enough
 * evidence to be initiated as a system track.
 */

import type {
  Covariance3x3,
  Position3D,
  SourceObservation,
  Timestamp,
  Velocity3D,
} from '@eloc2/domain';
import { generateId } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TBDCandidate {
  id: string;
  observations: SourceObservation[];
  cumulativeLLR: number;
  position: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  scanCount: number;
  hitCount: number;
  createdAt: Timestamp;
  lastUpdated: Timestamp;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new TBD candidate from an initial observation.
 */
export function createTBDCandidate(observation: SourceObservation): TBDCandidate {
  const now = Date.now() as Timestamp;
  return {
    id: generateId(),
    observations: [observation],
    cumulativeLLR: 0,
    position: { ...observation.position },
    velocity: observation.velocity ? { ...observation.velocity } : undefined,
    covariance: observation.covariance.map(row => [...row]) as Covariance3x3,
    scanCount: 1,
    hitCount: 1,
    createdAt: now,
    lastUpdated: now,
  };
}
