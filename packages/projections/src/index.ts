export interface RapView { tracks: unknown[]; timestamp: number; }
export interface TaskTimelineView { tasks: unknown[]; }
export interface TrackDetailView { track: unknown; }
export interface GeometryView { estimates: unknown[]; }
export interface ReplayView { events: unknown[]; startTime: number; endTime: number; }

// Sensor health view (Phase 2)
export { buildSensorHealthView } from './sensor-health-view.js';
export type { SensorHealthView, SensorHealthEntry } from './sensor-health-view.js';

// EO cue view (Phase 3)
export { buildEoCueView } from './eo-cue-view.js';
export type { EoCueViewEntry, EoCueView } from './eo-cue-view.js';

// Ambiguity view (Phase 5)
export { buildAmbiguityView } from './ambiguity-view.js';
export type {
  AmbiguityView,
  AmbiguityViewEntry,
  AmbiguityHypothesis,
  AssociationHypothesis as AmbiguityAssociationHypothesis,
} from './ambiguity-view.js';
