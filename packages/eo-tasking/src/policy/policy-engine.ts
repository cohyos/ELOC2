import type {
  PolicyMode,
  ScoreBreakdown,
  SensorId,
  TaskId,
  Timestamp,
} from '@eloc2/domain';
import type { TaskCandidate } from '../candidate-generation/generator.js';

// ---------------------------------------------------------------------------
// Operator override
// ---------------------------------------------------------------------------

/** An operator directive that overrides the automatic policy decision. */
export interface OperatorOverride {
  type: 'approve' | 'reject' | 'reserve';
  taskId?: TaskId;
  sensorId?: SensorId;
  timestamp: Timestamp;
  operatorId: string;
}

// ---------------------------------------------------------------------------
// Task decision
// ---------------------------------------------------------------------------

/** The result of applying policy to a scored candidate. */
export interface TaskDecision {
  candidate: TaskCandidate;
  score: ScoreBreakdown;
  approved: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Policy engine
// ---------------------------------------------------------------------------

/**
 * Applies the current policy mode and any operator overrides to a list of
 * scored task candidates, producing approval decisions.
 *
 * @param scoredTasks      - Scored candidates to evaluate.
 * @param mode             - The active policy mode.
 * @param operatorOverrides - Operator overrides that may approve or reject specific tasks.
 * @returns An array of task decisions.
 */
export function applyPolicy(
  scoredTasks: Array<{ candidate: TaskCandidate; score: ScoreBreakdown }>,
  mode: PolicyMode,
  operatorOverrides: OperatorOverride[],
): TaskDecision[] {
  // Build lookup maps for overrides by candidate's systemTrackId+sensorId key
  const rejections = new Set<string>();
  const approvals = new Set<string>();

  for (const override of operatorOverrides) {
    if (override.taskId) {
      const key = override.taskId as string;
      if (override.type === 'reject') {
        rejections.add(key);
      } else if (override.type === 'approve') {
        approvals.add(key);
      }
    }
  }

  return scoredTasks.map(({ candidate, score }) => {
    const candidateKey = `${candidate.systemTrackId as string}::${candidate.sensorId as string}`;

    switch (mode) {
      case 'recommended_only':
        return {
          candidate,
          score,
          approved: false,
          reason: 'recommended_only',
        };

      case 'auto_with_veto': {
        // Approve unless explicitly rejected by operator
        const isRejected = rejections.has(candidateKey);
        return {
          candidate,
          score,
          approved: !isRejected,
          reason: isRejected ? 'operator_rejected' : 'auto_approved',
        };
      }

      case 'manual': {
        // Approve only if explicitly approved by operator
        const isApproved = approvals.has(candidateKey);
        return {
          candidate,
          score,
          approved: isApproved,
          reason: isApproved ? 'operator_approved' : 'awaiting_approval',
        };
      }

      default:
        return {
          candidate,
          score,
          approved: false,
          reason: 'unknown_mode',
        };
    }
  });
}
