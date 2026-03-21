import { describe, it, expect } from 'vitest';
import {
  identityNxN,
  matNxNMultiply,
  matNxNInverse,
  matNxNTranspose,
  matNxNAdd,
  matNxNScale,
  matVecMultiply,
  outerProduct,
  trace,
} from '../matrix-nxn.js';

describe('identityNxN', () => {
  it('produces a 4x4 identity matrix', () => {
    const I = identityNxN(4);
    expect(I).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(I[i]).toHaveLength(4);
      for (let j = 0; j < 4; j++) {
        expect(I[i][j]).toBe(i === j ? 1 : 0);
      }
    }
  });

  it('produces a 1x1 identity matrix', () => {
    const I = identityNxN(1);
    expect(I[0][0]).toBe(1);
  });
});

describe('matNxNMultiply', () => {
  it('with identity returns original matrix', () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ];
    const I = identityNxN(3);
    const result = matNxNMultiply(I, A);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result[i][j]).toBeCloseTo(A[i][j], 10);
      }
    }
  });

  it('right-multiplying by identity returns original matrix', () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ];
    const I = identityNxN(3);
    const result = matNxNMultiply(A, I);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result[i][j]).toBeCloseTo(A[i][j], 10);
      }
    }
  });

  it('multiplies two 2x2 matrices correctly', () => {
    // [[1,2],[3,4]] x [[5,6],[7,8]] = [[19,22],[43,50]]
    const A = [[1, 2], [3, 4]];
    const B = [[5, 6], [7, 8]];
    const C = matNxNMultiply(A, B);

    expect(C[0][0]).toBe(19);
    expect(C[0][1]).toBe(22);
    expect(C[1][0]).toBe(43);
    expect(C[1][1]).toBe(50);
  });
});

describe('matNxNInverse', () => {
  it('inverse of a diagonal matrix is correct', () => {
    const D = [
      [2, 0, 0],
      [0, 4, 0],
      [0, 0, 5],
    ];
    const inv = matNxNInverse(D);

    expect(inv).not.toBeNull();
    expect(inv![0][0]).toBeCloseTo(0.5, 10);
    expect(inv![1][1]).toBeCloseTo(0.25, 10);
    expect(inv![2][2]).toBeCloseTo(0.2, 10);
    // Off-diagonal entries should be zero
    expect(inv![0][1]).toBeCloseTo(0, 10);
    expect(inv![1][0]).toBeCloseTo(0, 10);
    expect(inv![0][2]).toBeCloseTo(0, 10);
  });

  it('returns null for a singular matrix', () => {
    // Rows are linearly dependent — det = 0
    const singular = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const inv = matNxNInverse(singular);
    expect(inv).toBeNull();
  });

  it('A * A^-1 ≈ I for an invertible matrix', () => {
    const A = [
      [4, 7],
      [2, 6],
    ];
    const inv = matNxNInverse(A);
    expect(inv).not.toBeNull();

    const product = matNxNMultiply(A, inv!);
    const I = identityNxN(2);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(product[i][j]).toBeCloseTo(I[i][j], 10);
      }
    }
  });
});

describe('matNxNTranspose', () => {
  it('transposes a square matrix correctly', () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const At = matNxNTranspose(A);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(At[i][j]).toBe(A[j][i]);
      }
    }
  });

  it('double transpose returns the original matrix', () => {
    const A = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const tt = matNxNTranspose(matNxNTranspose(A));
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        expect(tt[i][j]).toBe(A[i][j]);
      }
    }
  });
});

describe('matVecMultiply', () => {
  it('with identity matrix returns input vector', () => {
    const v = [3, 7, 2, 5];
    const I = identityNxN(4);
    const result = matVecMultiply(I, v);

    for (let i = 0; i < 4; i++) {
      expect(result[i]).toBeCloseTo(v[i], 10);
    }
  });

  it('multiplies a known matrix by a vector correctly', () => {
    // [[1,2],[3,4]] * [5,6] = [17, 39]
    const A = [[1, 2], [3, 4]];
    const v = [5, 6];
    const result = matVecMultiply(A, v);

    expect(result[0]).toBeCloseTo(17, 10);
    expect(result[1]).toBeCloseTo(39, 10);
  });
});

describe('NxN Matrix Operations (additional)', () => {
  describe('trace', () => {
    it('computes sum of diagonal elements', () => {
      const A = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ];
      expect(trace(A)).toBe(15); // 1 + 5 + 9
    });
  });

  describe('outerProduct', () => {
    it('computes outer product correctly', () => {
      const a = [1, 2];
      const b = [3, 4];
      const result = outerProduct(a, b);
      expect(result).toEqual([[3, 4], [6, 8]]);
    });
  });

  describe('matNxNAdd', () => {
    it('adds two matrices element-wise', () => {
      const A = [[1, 2], [3, 4]];
      const B = [[5, 6], [7, 8]];
      const result = matNxNAdd(A, B);
      expect(result[0][0]).toBe(6);
      expect(result[0][1]).toBe(8);
      expect(result[1][0]).toBe(10);
      expect(result[1][1]).toBe(12);
    });
  });

  describe('matNxNScale', () => {
    it('scales all elements by a scalar', () => {
      const A = [[1, 2], [3, 4]];
      const result = matNxNScale(A, 2);
      expect(result[0][0]).toBe(2);
      expect(result[0][1]).toBe(4);
      expect(result[1][0]).toBe(6);
      expect(result[1][1]).toBe(8);
    });
  });
});
