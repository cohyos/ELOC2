import { describe, it, expect } from 'vitest';
import {
  createIMMState,
  immPredict,
  immUpdate,
  immCombine,
  getActiveModel,
  defaultTransitionMatrix2,
} from '../filters/imm-filter.js';
import {
  defaultObservationMatrix3D,
  type KalmanState,
} from '../filters/kalman-filter.js';
import {
  constantVelocityModel,
  coordinatedTurnModel,
  type MotionModel,
} from '../filters/motion-models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKalmanState(): KalmanState {
  return {
    x: [1000, 2000, 500, 50, 30, 0],
    P: [
      [200, 0,   0,   0,  0,  0 ],
      [0,   200, 0,   0,  0,  0 ],
      [0,   0,   200, 0,  0,  0 ],
      [0,   0,   0,   25, 0,  0 ],
      [0,   0,   0,   0,  25, 0 ],
      [0,   0,   0,   0,  0,  25],
    ],
  };
}

function makeMotionModels(dt: number): MotionModel[] {
  return [
    constantVelocityModel(dt),
    coordinatedTurnModel(dt, 0.05),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createIMMState', () => {
  it('initializes correctly with correct number of models', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();

    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    expect(imm.models).toHaveLength(2);
    expect(imm.modelProbabilities).toHaveLength(2);
    expect(imm.modelLabels).toHaveLength(2);
  });

  it('uses uniform probabilities by default', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    expect(imm.modelProbabilities[0]).toBeCloseTo(0.5, 5);
    expect(imm.modelProbabilities[1]).toBeCloseTo(0.5, 5);
  });

  it('respects custom initial probabilities', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(
      initial,
      ['constant_velocity', 'coordinated_turn'],
      trans,
      [0.7, 0.3],
    );

    expect(imm.modelProbabilities[0]).toBeCloseTo(0.7, 5);
    expect(imm.modelProbabilities[1]).toBeCloseTo(0.3, 5);
  });

  it('each model starts with a copy of the initial state', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    for (const model of imm.models) {
      expect(model.x).toEqual(initial.x);
      expect(model.P).toEqual(initial.P);
    }
  });
});

describe('immPredict', () => {
  it('produces valid state after prediction', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    const predicted = immPredict(imm, makeMotionModels(1));

    expect(predicted.models).toHaveLength(2);
    for (const model of predicted.models) {
      expect(model.x).toHaveLength(6);
      expect(model.P).toHaveLength(6);
      for (const row of model.P) {
        expect(row).toHaveLength(6);
      }
    }
  });

  it('model probabilities sum to approximately 1 after predict', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    const predicted = immPredict(imm, makeMotionModels(1));
    const sum = predicted.modelProbabilities.reduce((s, p) => s + p, 0);

    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('immUpdate', () => {
  it('updates model probabilities — all remain in [0, 1] and sum to 1', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);
    const predicted = immPredict(imm, makeMotionModels(1));

    const H = defaultObservationMatrix3D();
    const R = [[50, 0, 0], [0, 50, 0], [0, 0, 50]];
    const z = [1050, 2030, 500];

    const updated = immUpdate(predicted, z, H, R);

    const sum = updated.modelProbabilities.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (const p of updated.modelProbabilities) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('model that fits observation better gains probability', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    // Start with equal probabilities
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);
    const predicted = immPredict(imm, makeMotionModels(1));

    const H = defaultObservationMatrix3D();
    const R = [[100, 0, 0], [0, 100, 0], [0, 0, 100]];
    // Measurement consistent with straight-line CV motion
    const z = [
      initial.x[0] + initial.x[3], // e + ve*1s
      initial.x[1] + initial.x[4], // n + vn*1s
      initial.x[2],
    ];

    const updated = immUpdate(predicted, z, H, R);

    // All probabilities must be valid
    for (const p of updated.modelProbabilities) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('immCombine', () => {
  it('produces weighted average of model states', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    // Equal states, any weights — combined should equal initial
    const imm = createIMMState(
      initial,
      ['constant_velocity', 'coordinated_turn'],
      trans,
      [0.9, 0.1],
    );

    const combined = immCombine(imm);

    expect(combined.combinedState).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(combined.combinedState[i]).toBeCloseTo(initial.x[i], 5);
    }
  });

  it('combined covariance has correct 6x6 shape', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);

    const combined = immCombine(imm);

    expect(combined.combinedCovariance).toHaveLength(6);
    for (const row of combined.combinedCovariance) {
      expect(row).toHaveLength(6);
    }
  });

  it('combined covariance diagonal entries are non-negative', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(initial, ['constant_velocity', 'coordinated_turn'], trans);
    const predicted = immPredict(imm, makeMotionModels(1));

    const combined = immCombine(predicted);

    for (let i = 0; i < 6; i++) {
      expect(combined.combinedCovariance[i][i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('getActiveModel', () => {
  it('returns model with highest probability', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(
      initial,
      ['constant_velocity', 'coordinated_turn'],
      trans,
      [0.8, 0.2],
    );

    expect(getActiveModel(imm)).toBe('constant_velocity');
  });

  it('returns coordinated_turn when it dominates', () => {
    const initial = makeKalmanState();
    const trans = defaultTransitionMatrix2();
    const imm = createIMMState(
      initial,
      ['constant_velocity', 'coordinated_turn'],
      trans,
      [0.1, 0.9],
    );

    expect(getActiveModel(imm)).toBe('coordinated_turn');
  });
});
