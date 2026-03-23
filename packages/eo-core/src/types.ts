import type { Position3D, Velocity3D } from '@eloc2/domain';

/** EO track maintained by the CORE entity from triangulated bearings */
export interface EoCoreTrack {
  trackId: string;
  position: Position3D;
  velocity?: Velocity3D;
  confidence: number;
  quality: 'strong' | 'acceptable' | 'weak' | 'insufficient';
  intersectionAngleDeg: number;
  sensorIds: string[];
  updateCount: number;
  lastUpdateSec: number;
  status: 'active' | 'stale' | 'dropped';
}

/** Result of a triangulation attempt from the CORE wrapper */
export interface TriangulationOutput {
  position: Position3D;
  quality: 'strong' | 'acceptable' | 'weak' | 'insufficient';
  intersectionAngleDeg: number;
  averageMissDistanceM: number;
  sensorCount: number;
  sensorIds: string[];
}

/** Configuration for EoCoreEntity */
export interface EoCoreConfig {
  /** Max seconds without update before marking track stale (default 10) */
  staleTimeoutSec: number;
  /** Max seconds stale before dropping (default 30) */
  dropTimeoutSec: number;
  /** Distance threshold for matching triangulation to existing track (meters, default 2000) */
  trackAssociationDistanceM: number;
}
