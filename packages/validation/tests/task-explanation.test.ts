import { describe, it, expect, beforeEach } from 'vitest';
import { assertTaskExplanation } from '../src/assertions/task-explanation.js';
import { makeTaskDecided, resetCounter } from './helpers.js';

describe('assertTaskExplanation', () => {
  beforeEach(() => resetCounter());

  it('passes when all auto tasks have valid score breakdowns', () => {
    const events = [
      makeTaskDecided({ taskId: 'task-1', scoreTotal: 3.0 }),
      makeTaskDecided({ taskId: 'task-2', scoreTotal: 5.0 }),
    ];

    const result = assertTaskExplanation(events);
    expect(result.passed).toBe(true);
    expect(result.totalTasks).toBe(2);
    expect(result.tasksWithExplanation).toBe(2);
    expect(result.tasksWithoutExplanation).toBe(0);
  });

  it('fails when an auto task has zero total score', () => {
    const events = [
      makeTaskDecided({ taskId: 'task-1', scoreTotal: 3.0 }),
      makeTaskDecided({ taskId: 'task-2', scoreTotal: 0 }),
    ];

    const result = assertTaskExplanation(events);
    expect(result.passed).toBe(false);
    expect(result.tasksWithoutExplanation).toBe(1);
  });

  it('passes for manual tasks regardless of score', () => {
    const events = [
      makeTaskDecided({ taskId: 'task-1', mode: 'manual', scoreTotal: 0 }),
    ];

    const result = assertTaskExplanation(events);
    expect(result.passed).toBe(true);
    expect(result.tasksWithExplanation).toBe(1);
  });

  it('fails when no task events exist', () => {
    const result = assertTaskExplanation([]);
    expect(result.passed).toBe(false);
    expect(result.totalTasks).toBe(0);
    expect(result.details).toContain('No TaskDecided events found');
  });

  it('handles mixed auto and manual tasks', () => {
    const events = [
      makeTaskDecided({ taskId: 'task-1', mode: 'auto_with_veto', scoreTotal: 2.5 }),
      makeTaskDecided({ taskId: 'task-2', mode: 'manual', scoreTotal: 0 }),
      makeTaskDecided({ taskId: 'task-3', mode: 'recommended_only', scoreTotal: 4.0 }),
    ];

    const result = assertTaskExplanation(events);
    expect(result.passed).toBe(true);
    expect(result.totalTasks).toBe(3);
    expect(result.tasksWithExplanation).toBe(3);
  });
});
