import type {
  Position3D,
  Velocity3D,
  Covariance3x3,
  SensorId,
  Timestamp,
  QualityLevel,
  TargetClassification,
  BearingMeasurement,
  SensorType,
  DriTier,
} from '@eloc2/domain';

// ── Sensor → System Messages ──

/** Ground truth target state */
export interface GroundTruthTarget {
  targetId: string;
  position: Position3D;
  velocity: Velocity3D | undefined;
  classification?: TargetClassification;
  rcs?: number;
  irEmission?: number;
  active: boolean;
}

/** Periodic ground truth broadcast for all targets */
export interface GroundTruthBroadcast {
  messageType: 'gt.broadcast';
  simTimeSec: number;
  targets: GroundTruthTarget[];
}

/** Local track lifecycle status (bus-specific, distinct from domain LocalTrackStatus) */
export type BusLocalTrackStatus = 'new' | 'maintained' | 'coasting' | 'dropped';

/** Individual local track maintained by a sensor */
export interface LocalTrackReport {
  localTrackId: string;
  sensorId: SensorId;
  position: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  confidence: number;
  status: BusLocalTrackStatus;
  updateCount: number;
  missCount: number;
  existenceProbability: number;
  targetCategory: string; // 'bm' | 'abt' | 'unresolved'
  classifierConfidence: number;
  lastObservationTime: number; // sim seconds
  positionHistory: Array<{ lat: number; lon: number; alt: number; timeSec: number }>;
}

/** Sensor mode */
export type SensorMode = 'track' | 'search' | 'standby';

/** Sensor health / status snapshot */
export interface SensorStatusReport {
  sensorId: SensorId;
  sensorType: SensorType;
  online: boolean;
  mode: SensorMode;
  trackCount: number;
  registrationHealth?: QualityLevel;
}

/** Batch track report from a radar / C4ISR sensor */
export interface SensorTrackReport {
  messageType: 'sensor.track.report';
  sensorId: SensorId;
  sensorType: SensorType;
  timestamp: Timestamp;
  simTimeSec: number;
  localTracks: LocalTrackReport[];
  sensorStatus: SensorStatusReport;
}

/** Single bearing measurement with metadata */
export interface BearingMeasurementReport {
  bearing: BearingMeasurement;
  targetId: string;
  imageQuality: number;
  sensorPosition: Position3D;
  /** DRI tier achieved at this range (detection / recognition / identification) */
  driTier?: DriTier;
}

/** EO bearing report containing one or more measurements */
export interface BearingReport {
  messageType: 'sensor.bearing.report';
  sensorId: SensorId;
  timestamp: Timestamp;
  simTimeSec: number;
  bearings: BearingMeasurementReport[];
  gimbalState: {
    azimuthDeg: number;
    elevationDeg: number;
    slewRateDegPerSec: number;
    currentTargetId?: string;
  };
}

// ── System → Sensor Commands ──

/** Cue sensor to investigate a system track */
export interface CueCommand {
  type: 'cue';
  systemTrackId: string;
  predictedPosition: Position3D;
  predictedVelocity?: Velocity3D;
  uncertaintyGateDeg: number;
  priority: number;
}

/** Switch sensor operating mode */
export interface ModeCommand {
  type: 'mode';
  mode: SensorMode;
}

/** Assign a scan pattern to a sensor */
export interface SearchPatternCommand {
  type: 'search_pattern';
  pattern: 'sector' | 'raster';
  azimuthStartDeg: number;
  azimuthEndDeg: number;
  elevationStartDeg?: number;
  elevationEndDeg?: number;
  scanSpeedDegPerSec: number;
}

/** Override gating parameters for a specific local track */
export interface GatingOverrideCommand {
  type: 'gating_override';
  localTrackId: string;
  category: string; // 'bm' | 'abt'
  gateThreshold: number;
  velocityGateThreshold: number;
}

/** Discriminated union of all command types */
export type SensorCommand =
  | CueCommand
  | ModeCommand
  | SearchPatternCommand
  | GatingOverrideCommand;

/** Envelope for commands sent from the system to a specific sensor */
export interface SystemCommand {
  messageType: 'system.command';
  commandId: string;
  targetSensorId: SensorId;
  simTimeSec: number;
  command: SensorCommand;
}
