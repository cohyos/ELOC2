import type { EventEnvelope, TaskDecided } from '@eloc2/events';

// ---------------------------------------------------------------------------
// Task explanation assertion
// ---------------------------------------------------------------------------

export interface TaskExplanationResult {
  passed: boolean;
  totalTasks: number;
  tasksWithExplanation: number;
  tasksWithoutExplanation: number;
  details: string[];
}

/**
 * Validates that every auto-task has a score breakdown with non-zero total.
 */
export function assertTaskExplanation(
  events: EventEnvelope[],
): TaskExplanationResult {
  const details: string[] = [];

  const taskEvents = events.filter(
    (e): e is TaskDecided => e.eventType === 'task.decided',
  );

  const totalTasks = taskEvents.length;
  let tasksWithExplanation = 0;
  let tasksWithoutExplanation = 0;

  for (const evt of taskEvents) {
    const { taskId, scoreBreakdown, mode } = evt.data;

    // Only validate auto tasks (not manual)
    if (mode === 'manual') {
      tasksWithExplanation++;
      continue;
    }

    if (scoreBreakdown && scoreBreakdown.total !== 0) {
      tasksWithExplanation++;
    } else {
      tasksWithoutExplanation++;
      details.push(
        `Task ${taskId} has no valid score breakdown (total=${scoreBreakdown?.total ?? 'undefined'})`,
      );
    }
  }

  if (totalTasks === 0) {
    details.push('No TaskDecided events found');
  }

  const passed = tasksWithoutExplanation === 0 && totalTasks > 0;

  if (passed) {
    details.push('All auto-tasks have valid score breakdowns');
  }

  return { passed, totalTasks, tasksWithExplanation, tasksWithoutExplanation, details };
}
