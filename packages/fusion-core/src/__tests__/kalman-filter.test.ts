import { describe, it, expect } from 'vitest';
import {
  kalmanPredict,
  kalmanUpdate,
  defaultObservationMatrix3D,
  type KalmanState,
} from '../filters/kalman-filter.js';
import { constantVelocityModel } from '../filters/motion-models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInitialState(): KalmanState {
  return {
    x: [1000, 2000, 500, 10, 20, 0], // e, n, u, ve, vn, vu (meters, m/s)
    P: [
      [100, 0,   0,   0,  0,  0 ],
      [0,   100, 0,   0,  0,  0 ],
      [0,   0,   100, 0,  0,  0 ],
      [0,   0,   0,   10, 0,  0 ],
      [0,   0,   0,   0,  10, 0 ],
      [0,   0,   0,   0,  0,  10],
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kalmanPredict with CV model', () => {
  it('advances position correctly for a 1-second step', () => {
    const state = makeInitialState();
    const dt = 1; // seconds
    const { F, Q } = constantVelocityModel(dt);

    const predicted = kalmanPredict(state, F, Q);

    // x' = x + ve * dt
    expect(predicted.x[0]).toBeCloseTo(1000 + 10 * dt, 3); // east
    expect(predicted.x[1]).toBeCloseTo(2000 + 20 * dt, 3); // north
    expect(predicted.x[2]).toBeCloseTo(500 + 0 * dt, 3);   // up
    // velocities unchanged in CV
    expect(predicted.x[3]).toBeCloseTo(10, 3);
    expect(predicted.x[4]).toBeCloseTo(20, 3);
    expect(predicted.x[5]).toBeCloseTo(0, 3);
  });

  it('grows covariance during prediction', () => {
    const state = makeInitialState();
    const { F, Q } = constantVelocityModel(2);

    const predicted = kalmanPredict(state, F, Q);

    expect(predicted.P[0][0]).toBeGreaterThan(state.P[0][0]);
    expect(predicted.P[1][1]).toBeGreaterThan(state.P[1][1]);
  });

  it('produces a 6x6 predicted covariance', () => {
    const state = makeInitialState();
    const { F, Q } = constantVelocityModel(1);
    const predicted = kalmanPredict(state, F, Q);

    expect(predicted.P).toHaveLength(6);
    for (const row of predicted.P) {
      expect(row).toHaveLength(6);
    }
  });
});

describe('kalmanUpdate', () => {
  it('update with perfect measurement improves covariance', () => {
    const state = makeInitialState();
    const z = [1000, 2000, 500]; // exact match
    const H = defaultObservationMatrix3D();
    // Very precise measurement noise
    const R = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    const { state: updated } = kalmanUpdate(state, z, H, R);

    // Position covariance should decrease
    expect(updated.P[0][0]).toBeLessThan(state.P[0][0]);
    expect(updated.P[1][1]).toBeLessThan(state.P[1][1]);
    expect(updated.P[2][2]).toBeLessThan(state.P[2][2]);
  });

  it('brings state closer to measurement', () => {
    const state = makeInitialState();
    // Measurement 100m further east
    const z = [1100, 2000, 500];
    const H = defaultObservationMatrix3D();
    const R = [
      [50, 0,  0 ],
      [0,  50, 0 ],
      [0,  0,  50],
    ];

    const { state: updated } = kalmanUpdate(state, z, H, R);

    // Updated east should be between initial (1000) and measurement (1100)
    expect(updated.x[0]).toBeGreaterThan(1000);
    expect(updated.x[0]).toBeLessThan(1100);
  });

  it('returns a finite log-likelihood for valid update', () => {
    const state = makeInitialState();
    const z = [1000, 2000, 500];
    const H = defaultObservationMatrix3D();
    const R = [[50, 0, 0], [0, 50, 0], [0, 0, 50]];

    const { logLikelihood } = kalmanUpdate(state, z, H, R);

    expect(Number.isFinite(logLikelihood)).toBe(true);
  });
});

describe('defaultObservationMatrix3D', () => {
  it('has correct shape: 3 rows, 6 columns', () => {
    const H = defaultObservationMatrix3D();
    expect(H).toHaveLength(3);
    for (const row of H) {
      expect(row).toHaveLength(6);
    }
  });

  it('observes only position states — columns 0, 1, 2', () => {
    const H = defaultObservationMatrix3D();
    // Row 0: east
    expect(H[0][0]).toBe(1);
    expect(H[0][1]).toBe(0);
    expect(H[0][2]).toBe(0);
    expect(H[0][3]).toBe(0);
    expect(H[0][4]).toBe(0);
    expect(H[0][5]).toBe(0);
    // Row 1: north
    expect(H[1][1]).toBe(1);
    expect(H[1][0]).toBe(0);
    // Row 2: up
    expect(H[2][2]).toBe(1);
    expect(H[2][0]).toBe(0);
  });
});
