// Common types & branded identifiers
export type {
  SystemTrackId,
  SourceTrackId,
  EoTrackId,
  SensorId,
  TaskId,
  EventId,
  CueId,
  GroupId,
  Timestamp,
  Position3D,
  Velocity3D,
  Covariance3x3,
  Covariance6x6,
  QualityLevel,
  BearingMeasurement,
  TargetClassification,
  ClassificationSource,
} from './common-types.js';

// Source track
export type {
  SensorFrame,
  SourceObservation,
  LocalTrackStatus,
  LocalTrack,
} from './source-track.js';

// System track
export type {
  TrackStatus,
  TrackLineageEntry,
  EoInvestigationStatus,
  SystemTrack,
} from './system-track.js';

// EO track
export type {
  EoTrackStatus,
  IdentificationSupport,
  EoTrack,
} from './eo-track.js';

// Unresolved group
export type {
  UnresolvedGroupStatus,
  UnresolvedGroup,
} from './unresolved-group.js';

// Task & cue
export type {
  EoCue,
  TaskStatus,
  ScoreBreakdown,
  PolicyMode,
  Task,
} from './task.js';

// Geometry estimate
export type {
  GeometryClass,
  GeometryQuality,
  GeometryEstimate,
} from './geometry-estimate.js';

// Registration state
export type {
  SpatialBias,
  ClockBias,
  RegistrationState,
} from './registration-state.js';

// Sensor state
export type {
  SensorType,
  GimbalState,
  FieldOfView,
  CoverageArc,
  SensorState,
} from './sensor-state.js';

// Lineage
export type { LineageChain } from './lineage.js';
export { createLineageEntry } from './lineage.js';
