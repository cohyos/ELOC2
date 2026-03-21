import { describe, it, expect } from 'vitest';
import { hungarianAssignment } from '../mht/hungarian.js';

describe('hungarianAssignment', () => {
  it('2x2 cost matrix returns optimal assignment', () => {
    // Optimal: worker 0 → job 0 (cost 1), worker 1 → job 1 (cost 2), total = 3
    const cost = [
      [1, 3],
      [5, 2],
    ];
    const result = hungarianAssignment(cost);

    expect(result.assignment).toEqual([0, 1]);
    expect(result.cost).toBe(3);
  });

  it('3x3 cost matrix returns correct assignment', () => {
    // Optimal: 0→1(5), 1→0(3), 2→2(2), total = 10
    const cost = [
      [10, 5, 13],
      [3,  7, 11],
      [6,  9,  2],
    ];
    const result = hungarianAssignment(cost);

    expect(result.cost).toBe(10);
    // Verify each worker gets a unique job
    const assigned = result.assignment.filter(j => j >= 0);
    const uniqueJobs = new Set(assigned);
    expect(uniqueJobs.size).toBe(assigned.length);
  });

  it('single element matrix works', () => {
    const result = hungarianAssignment([[42]]);

    expect(result.assignment).toEqual([0]);
    expect(result.cost).toBe(42);
  });

  it('empty matrix returns empty assignment', () => {
    const result = hungarianAssignment([]);

    expect(result.assignment).toEqual([]);
    expect(result.cost).toBe(0);
  });

  it('large costs (Infinity) are handled — feasible assignments still made', () => {
    // Only feasible: worker 0 → job 0, worker 1 → job 1
    const cost = [
      [1, Infinity],
      [Infinity, 2],
    ];
    const result = hungarianAssignment(cost);

    expect(result.assignment[0]).toBe(0);
    expect(result.assignment[1]).toBe(1);
    expect(result.cost).toBe(3);
  });

  it('assigns all workers when a valid complete assignment exists', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const result = hungarianAssignment(cost);

    // Every worker should be assigned
    expect(result.assignment).toHaveLength(3);
    for (const j of result.assignment) {
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(3);
    }

    // Assignments must be unique
    const uniqueJobs = new Set(result.assignment);
    expect(uniqueJobs.size).toBe(3);
  });

  it('total cost is the sum of individually assigned costs', () => {
    const cost = [
      [3, 1],
      [2, 4],
    ];
    const result = hungarianAssignment(cost);
    const expectedCost = result.assignment.reduce(
      (sum, j, i) => sum + (j >= 0 ? cost[i][j] : 0),
      0,
    );
    expect(result.cost).toBeCloseTo(expectedCost, 5);
  });
});
