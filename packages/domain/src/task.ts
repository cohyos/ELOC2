import type {
  Covariance3x3,
  CueId,
  Position3D,
  QualityLevel,
  SensorId,
  SystemTrackId,
  TaskId,
  Timestamp,
  Velocity3D,
} from './common-types.js';

// ---------------------------------------------------------------------------
// EO cue
// ---------------------------------------------------------------------------

/**
 * A cue sent to an EO sensor, predicting where a system track should appear
 * and requesting an observation.
 */
export interface EoCue {
  cueId: CueId;
  systemTrackId: SystemTrackId;
  predictedState: Position3D;
  predictedVelocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  /** Uncertainty gate radius in degrees. */
  uncertaintyGateDeg: number;
  /** Priority — higher is more urgent. */
  priority: number;
  validFrom: Timestamp;
  validTo: Timestamp;
  expectedTargetCount: number;
  suggestedDwellMs: number;
  registrationHealth: QualityLevel;
}

// ---------------------------------------------------------------------------
// Task status & scoring
// ---------------------------------------------------------------------------

/** Lifecycle status of a task. */
export type TaskStatus =
  | 'proposed'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'expired';

/** Breakdown of the multi-criteria score used to rank tasks. */
export interface ScoreBreakdown {
  threatScore: number;
  uncertaintyReduction: number;
  geometryGain: number;
  operatorIntent: number;
  slewCost: number;
  occupancyCost: number;
  total: number;
}

/** Policy mode governing how tasks are approved. */
export type PolicyMode = 'recommended_only' | 'auto_with_veto' | 'manual';

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

/**
 * A task represents the assignment of an EO cue to a specific sensor
 * for execution, including its scoring rationale and approval status.
 */
export interface Task {
  taskId: TaskId;
  cueId: CueId;
  sensorId: SensorId;
  systemTrackId: SystemTrackId;
  status: TaskStatus;
  scoreBreakdown: ScoreBreakdown;
  policyMode: PolicyMode;
  operatorOverride: string | undefined;
  createdAt: Timestamp;
  completedAt: Timestamp | undefined;
}
