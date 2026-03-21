/**
 * Hungarian algorithm for optimal assignment.
 *
 * Given an NxM cost matrix (N workers, M jobs), finds the assignment
 * that minimizes total cost. Handles rectangular matrices.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignmentResult {
  /** Assignment: assignment[i] = j means worker i is assigned to job j. -1 = unassigned. */
  assignment: number[];
  /** Total cost of the assignment. */
  cost: number;
}

// ---------------------------------------------------------------------------
// Hungarian Algorithm
// ---------------------------------------------------------------------------

/**
 * Find the optimal 1-to-1 assignment using the Hungarian algorithm.
 *
 * @param costMatrix NxM cost matrix. costMatrix[i][j] = cost of assigning i to j.
 *                   Use Infinity for infeasible assignments.
 * @returns Optimal assignment and total cost.
 */
export function hungarianAssignment(costMatrix: number[][]): AssignmentResult {
  const n = costMatrix.length;
  if (n === 0) return { assignment: [], cost: 0 };

  const m = costMatrix[0].length;
  if (m === 0) return { assignment: new Array(n).fill(-1), cost: 0 };

  // Pad to square matrix if needed
  const size = Math.max(n, m);
  const C: number[][] = [];
  for (let i = 0; i < size; i++) {
    const row: number[] = [];
    for (let j = 0; j < size; j++) {
      if (i < n && j < m) {
        row.push(isFinite(costMatrix[i][j]) ? costMatrix[i][j] : 1e15);
      } else {
        row.push(0); // dummy assignments have zero cost
      }
    }
    C.push(row);
  }

  // Step 1: Subtract row minima
  for (let i = 0; i < size; i++) {
    const minVal = Math.min(...C[i]);
    for (let j = 0; j < size; j++) C[i][j] -= minVal;
  }

  // Step 2: Subtract column minima
  for (let j = 0; j < size; j++) {
    let minVal = Infinity;
    for (let i = 0; i < size; i++) {
      if (C[i][j] < minVal) minVal = C[i][j];
    }
    for (let i = 0; i < size; i++) C[i][j] -= minVal;
  }

  // Augmentation-based approach
  const rowMatch = new Array(size).fill(-1);
  const colMatch = new Array(size).fill(-1);

  for (let iter = 0; iter < size * size + size; iter++) {
    // Try to find augmenting paths
    let matched = 0;
    for (let i = 0; i < size; i++) {
      if (rowMatch[i] !== -1) {
        matched++;
        continue;
      }

      // BFS for augmenting path
      const visited = new Array(size).fill(false);
      if (augment(i, C, rowMatch, colMatch, visited, size)) {
        matched++;
      }
    }

    if (matched === size) break;

    // Find minimum uncovered value and adjust
    const rowCovered = new Array(size).fill(false);
    const colCovered = new Array(size).fill(false);

    // Mark covered rows (matched rows)
    for (let i = 0; i < size; i++) {
      if (rowMatch[i] !== -1) rowCovered[i] = true;
    }

    // Find uncovered zeros and mark columns
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < size; i++) {
        if (rowCovered[i]) continue;
        for (let j = 0; j < size; j++) {
          if (colCovered[j]) continue;
          if (Math.abs(C[i][j]) < 1e-10) {
            colCovered[j] = true;
            changed = true;
          }
        }
      }
      for (let j = 0; j < size; j++) {
        if (!colCovered[j]) continue;
        for (let i = 0; i < size; i++) {
          if (!rowCovered[i]) continue;
          if (colMatch[j] === i) {
            rowCovered[i] = false;
            changed = true;
          }
        }
      }
    }

    // Find minimum uncovered value
    let minUncovered = Infinity;
    for (let i = 0; i < size; i++) {
      if (rowCovered[i]) continue;
      for (let j = 0; j < size; j++) {
        if (colCovered[j]) continue;
        if (C[i][j] < minUncovered) minUncovered = C[i][j];
      }
    }

    if (!isFinite(minUncovered) || minUncovered <= 0) break;

    // Subtract from uncovered, add to doubly-covered
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (!rowCovered[i] && !colCovered[j]) {
          C[i][j] -= minUncovered;
        } else if (rowCovered[i] && colCovered[j]) {
          C[i][j] += minUncovered;
        }
      }
    }

    // Reset matches and re-solve
    rowMatch.fill(-1);
    colMatch.fill(-1);
  }

  // Extract result for original dimensions
  const assignment = new Array(n).fill(-1);
  let totalCost = 0;

  for (let i = 0; i < n; i++) {
    const j = rowMatch[i];
    if (j >= 0 && j < m && isFinite(costMatrix[i][j])) {
      assignment[i] = j;
      totalCost += costMatrix[i][j];
    }
  }

  return { assignment, cost: totalCost };
}

/** DFS augmenting path search. */
function augment(
  row: number,
  C: number[][],
  rowMatch: number[],
  colMatch: number[],
  visited: boolean[],
  size: number,
): boolean {
  for (let j = 0; j < size; j++) {
    if (visited[j] || Math.abs(C[row][j]) > 1e-10) continue;
    visited[j] = true;

    if (colMatch[j] === -1 || augment(colMatch[j], C, rowMatch, colMatch, visited, size)) {
      rowMatch[row] = j;
      colMatch[j] = row;
      return true;
    }
  }
  return false;
}
