import type {
  ScoreBreakdown,
  SensorId,
  SystemTrackId,
  TaskId,
} from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// task.decided
// ---------------------------------------------------------------------------

/** Emitted when the task manager decides to assign a cue to a sensor. */
export interface TaskDecided extends EventEnvelope {
  eventType: 'task.decided';
  data: {
    taskId: TaskId;
    sensorId: SensorId;
    systemTrackId: SystemTrackId;
    scoreBreakdown: ScoreBreakdown;
    mode: 'recommended_only' | 'auto_with_veto' | 'manual';
    operatorOverride: string | undefined;
  };
}
