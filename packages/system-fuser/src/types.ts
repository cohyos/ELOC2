import type {
  Position3D,
  Velocity3D,
  Covariance3x3,
  SensorId,
  SystemTrackId,
  Timestamp,
  TrackStatus,
  TargetClassification,
  ClassificationSource,
} from '@eloc2/domain';

/** System-level fused track produced by the SystemFuser */
export interface FusedSystemTrack {
  systemTrackId: SystemTrackId;
  state: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  confidence: number;
  status: TrackStatus;
  lastUpdated: Timestamp;
  /** Contributing sensor IDs */
  sources: SensorId[];
  /** Contributing local track IDs */
  contributingLocalTrackIds: string[];
  /** Number of updates received */
  updateCount: number;
  /** Consecutive misses (no matching local track report) */
  missCount: number;
  /** Target category from multi-sensor classification (bm/abt/unresolved) */
  targetCategory: string;
  classifierConfidence: number;
  /** Classification label (e.g. 'fighter_aircraft', 'missile', 'drone') */
  classification?: TargetClassification;
  /** Source that assigned the classification */
  classificationSource?: ClassificationSource;
  /** Confidence in the classification [0, 1] */
  classificationConfidence?: number;
  /**
   * Classification quality grade based on source agreement.
   * - 'high': trajectory + EO/operator agree
   * - 'medium': single source classification
   * - 'low': sources disagree or insufficient data
   * - 'unclassified': no classification assigned
   */
  classificationQuality?: 'high' | 'medium' | 'low' | 'unclassified';
  /** Trajectory classification (kept separately for agreement checking) */
  trajectoryClassification?: TargetClassification;
  trajectoryConfidence?: number;
}

/** Configuration for SystemFuser */
export interface SystemFuserConfig {
  /** Mahalanobis distance threshold for track-to-track correlation */
  correlationThreshold: number;
  /** Max consecutive misses before coasting */
  coastingMissThreshold: number;
  /** Max consecutive misses before dropping */
  dropAfterMisses: number;
  /** Number of updates required for confirmation */
  confirmAfter: number;
  /** Distance threshold for merging close system tracks (meters) */
  mergeDistanceM: number;
}

export const DEFAULT_SYSTEM_FUSER_CONFIG: SystemFuserConfig = {
  correlationThreshold: 120, // 15 Hz: wider gate for smaller covariance (was 50 at 1Hz)
  coastingMissThreshold: 15, // 15 Hz: ~1.0s to coast (was 5 at 1Hz)
  dropAfterMisses: 45,       // 15 Hz: ~3.0s to drop (was 12 at 1Hz)
  confirmAfter: 5,           // 15 Hz: ~333ms to confirm (was 3 at 1Hz)
  mergeDistanceM: 150,       // Spatial — unchanged
};
