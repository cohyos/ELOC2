import type {
  PolicyMode,
  ScoreBreakdown,
  SensorId,
  SystemTrackId,
  TaskId,
} from '@eloc2/domain';
import { generateId } from '@eloc2/shared-utils';
import type { TaskDecision } from '../policy/policy-engine.js';

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/** A concrete assignment of a sensor to a task. */
export interface Assignment {
  taskId: TaskId;
  sensorId: SensorId;
  systemTrackId: SystemTrackId;
  scoreBreakdown: ScoreBreakdown;
  mode: PolicyMode;
}

// ---------------------------------------------------------------------------
// Assigner
// ---------------------------------------------------------------------------

/**
 * Greedy assignment: sorts approved decisions by total score descending,
 * then assigns each sensor to at most one task (the highest-scored one).
 *
 * @param decisions - Task decisions from the policy engine.
 * @returns An array of assignments (one per sensor maximum).
 */
export function assignTasks(
  decisions: TaskDecision[],
  mode: PolicyMode = 'auto_with_veto',
): Assignment[] {
  // Only consider approved decisions
  const approved = decisions.filter((d) => d.approved);

  // Sort by total score descending
  const sorted = [...approved].sort(
    (a, b) => b.score.total - a.score.total,
  );

  const assignedSensors = new Set<string>();
  const assignments: Assignment[] = [];

  for (const decision of sorted) {
    const sensorKey = decision.candidate.sensorId as string;

    if (assignedSensors.has(sensorKey)) {
      continue; // sensor already assigned
    }

    assignedSensors.add(sensorKey);
    assignments.push({
      taskId: generateId() as TaskId,
      sensorId: decision.candidate.sensorId,
      systemTrackId: decision.candidate.systemTrackId,
      scoreBreakdown: decision.score,
      mode,
    });
  }

  return assignments;
}
