/**
 * Murty's algorithm for K-best assignments.
 *
 * Given a cost matrix, finds the K lowest-cost 1-to-1 assignments
 * using the Hungarian algorithm as a subroutine.
 */

import { hungarianAssignment, type AssignmentResult } from './hungarian.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MurtyAssignment extends AssignmentResult {
  /** Rank of this assignment (0 = best). */
  rank: number;
}

// ---------------------------------------------------------------------------
// Murty's algorithm
// ---------------------------------------------------------------------------

/**
 * Find the K best assignments for a cost matrix.
 *
 * @param costMatrix NxM cost matrix.
 * @param k Maximum number of assignments to find.
 * @returns Array of up to K assignments, sorted by cost ascending.
 */
export function kBestAssignments(
  costMatrix: number[][],
  k: number,
): MurtyAssignment[] {
  const n = costMatrix.length;
  if (n === 0 || k <= 0) return [];

  // Find the best assignment
  const best = hungarianAssignment(costMatrix);
  const results: MurtyAssignment[] = [{
    ...best,
    rank: 0,
  }];

  if (k === 1) return results;

  // Priority queue of partitioned problems (sorted by cost)
  interface PartitionedProblem {
    costMatrix: number[][];
    fixedAssignments: Map<number, number>; // row → col (forced)
    excludedAssignments: Map<number, Set<number>>; // row → excluded cols
    expectedCost: number;
  }

  const queue: PartitionedProblem[] = [];

  // Generate partitioned problems from the best assignment
  generatePartitions(costMatrix, best.assignment, new Map(), new Map(), queue);

  // Process queue
  while (results.length < k && queue.length > 0) {
    // Sort by expected cost and take the best
    queue.sort((a, b) => a.expectedCost - b.expectedCost);
    const problem = queue.shift()!;

    // Build modified cost matrix with exclusions
    const modifiedCost = problem.costMatrix.map(row => [...row]);
    for (const [row, excluded] of problem.excludedAssignments) {
      for (const col of excluded) {
        modifiedCost[row][col] = Infinity;
      }
    }

    // Apply forced assignments by making all other entries in the row/col Infinity
    for (const [row, col] of problem.fixedAssignments) {
      for (let j = 0; j < modifiedCost[0].length; j++) {
        if (j !== col) modifiedCost[row][j] = Infinity;
      }
      for (let i = 0; i < modifiedCost.length; i++) {
        if (i !== row) modifiedCost[i][col] = Infinity;
      }
    }

    const result = hungarianAssignment(modifiedCost);

    // Check if it's a valid assignment (not all -1)
    const validAssignments = result.assignment.filter(j => j >= 0);
    if (validAssignments.length === 0) continue;

    results.push({
      ...result,
      rank: results.length,
    });

    // Generate sub-partitions
    generatePartitions(
      costMatrix,
      result.assignment,
      problem.fixedAssignments,
      problem.excludedAssignments,
      queue,
    );
  }

  return results;
}

/**
 * Generate partitioned sub-problems from an assignment.
 */
function generatePartitions(
  costMatrix: number[][],
  assignment: number[],
  fixedAssignments: Map<number, number>,
  excludedAssignments: Map<number, Set<number>>,
  queue: Array<{
    costMatrix: number[][];
    fixedAssignments: Map<number, number>;
    excludedAssignments: Map<number, Set<number>>;
    expectedCost: number;
  }>,
): void {
  const n = costMatrix.length;

  for (let i = 0; i < n; i++) {
    const j = assignment[i];
    if (j < 0) continue;
    if (fixedAssignments.has(i)) continue; // Already fixed

    // Create a sub-problem where assignment (i, j) is excluded
    const newFixed = new Map(fixedAssignments);
    const newExcluded = new Map<number, Set<number>>();
    for (const [row, cols] of excludedAssignments) {
      newExcluded.set(row, new Set(cols));
    }

    // Fix all assignments before this one
    for (let r = 0; r < i; r++) {
      if (assignment[r] >= 0 && !newFixed.has(r)) {
        newFixed.set(r, assignment[r]);
      }
    }

    // Exclude (i, j)
    if (!newExcluded.has(i)) newExcluded.set(i, new Set());
    newExcluded.get(i)!.add(j);

    // Estimate cost (lower bound)
    let estimatedCost = 0;
    for (const [row, col] of newFixed) {
      estimatedCost += costMatrix[row][col];
    }

    queue.push({
      costMatrix,
      fixedAssignments: newFixed,
      excludedAssignments: newExcluded,
      expectedCost: estimatedCost,
    });
  }
}
