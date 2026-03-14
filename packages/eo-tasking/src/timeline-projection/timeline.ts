import type {
  ScoreBreakdown,
  SensorId,
  SystemTrackId,
  TaskId,
  TaskStatus,
  Timestamp,
} from '@eloc2/domain';
import type { TaskDecided } from '@eloc2/events';
import type { Assignment } from '../assignment/assigner.js';

// ---------------------------------------------------------------------------
// Task timeline entry
// ---------------------------------------------------------------------------

/** A single entry in the task timeline, representing a task at a point in time. */
export interface TaskTimelineEntry {
  taskId: TaskId;
  sensorId: SensorId;
  systemTrackId: SystemTrackId;
  scoreBreakdown: ScoreBreakdown;
  status: TaskStatus;
  timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Timeline builder
// ---------------------------------------------------------------------------

/**
 * Builds a unified task timeline by combining current assignments with
 * historical task-decided events.
 *
 * @param assignments - Current round of assignments.
 * @param history     - Historical TaskDecided events.
 * @returns A chronologically-ordered array of timeline entries.
 */
export function buildTaskTimeline(
  assignments: Assignment[],
  history: TaskDecided[],
): TaskTimelineEntry[] {
  const entries: TaskTimelineEntry[] = [];

  // Add historical entries
  for (const event of history) {
    entries.push({
      taskId: event.data.taskId,
      sensorId: event.data.sensorId,
      systemTrackId: event.data.systemTrackId,
      scoreBreakdown: event.data.scoreBreakdown,
      status: 'completed',
      timestamp: event.timestamp,
    });
  }

  // Add current assignments as 'proposed' entries
  const now = Date.now() as Timestamp;
  for (const assignment of assignments) {
    entries.push({
      taskId: assignment.taskId,
      sensorId: assignment.sensorId,
      systemTrackId: assignment.systemTrackId,
      scoreBreakdown: assignment.scoreBreakdown,
      status: 'proposed',
      timestamp: now,
    });
  }

  // Sort chronologically
  entries.sort(
    (a, b) => (a.timestamp as number) - (b.timestamp as number),
  );

  return entries;
}
