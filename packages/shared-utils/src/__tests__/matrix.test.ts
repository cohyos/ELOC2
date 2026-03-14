import { describe, it, expect } from "vitest";
import {
  identity3x3,
  mat3x3Multiply,
  mat3x3Inverse,
  mat3x3Add,
  mat3x3Scale,
  mat3x3Transpose,
  mahalanobisDistance,
} from "../matrix.js";

describe("identity3x3", () => {
  it("multiplied by any matrix yields that same matrix", () => {
    const m = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const result = mat3x3Multiply(identity3x3(), m);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result[i][j]).toBeCloseTo(m[i][j], 10);
      }
    }
  });

  it("identity is its own inverse", () => {
    const inv = mat3x3Inverse(identity3x3());
    expect(inv).not.toBeNull();
    const id = identity3x3();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(inv![i][j]).toBeCloseTo(id[i][j], 10);
      }
    }
  });
});

describe("mat3x3Inverse", () => {
  it("computes the correct inverse of a known 3x3 matrix", () => {
    // Matrix: [[2,1,1],[1,3,2],[1,0,0]]
    // det = 2*(3*0-2*0) - 1*(1*0-2*1) + 1*(1*0-3*1) = 0 + 2 - 3 = -1
    // Inverse should be: [[0,0,-1],[2,-1,-3],[-3,1,5]]
    const m = [
      [2, 1, 1],
      [1, 3, 2],
      [1, 0, 0],
    ];

    const inv = mat3x3Inverse(m);
    expect(inv).not.toBeNull();

    // Verify M * M^-1 = I
    const product = mat3x3Multiply(m, inv!);
    const id = identity3x3();

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i][j]).toBeCloseTo(id[i][j], 8);
      }
    }
  });

  it("returns null for a singular matrix", () => {
    const singular = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    expect(mat3x3Inverse(singular)).toBeNull();
  });
});

describe("mat3x3Add", () => {
  it("adds two matrices element-wise", () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const b = [
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ];

    const result = mat3x3Add(a, b);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result[i][j]).toBe(10);
      }
    }
  });
});

describe("mat3x3Scale", () => {
  it("scales every element by a scalar", () => {
    const m = identity3x3();
    const scaled = mat3x3Scale(m, 5);
    expect(scaled[0][0]).toBe(5);
    expect(scaled[1][1]).toBe(5);
    expect(scaled[2][2]).toBe(5);
    expect(scaled[0][1]).toBe(0);
  });
});

describe("mat3x3Transpose", () => {
  it("transposes a matrix correctly", () => {
    const m = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const t = mat3x3Transpose(m);
    expect(t[0][1]).toBe(4);
    expect(t[1][0]).toBe(2);
    expect(t[2][0]).toBe(3);
  });
});

describe("mahalanobisDistance", () => {
  it("equals euclidean distance when invCov is identity", () => {
    const dx = [3, 4, 0];
    const dist = mahalanobisDistance(dx, identity3x3());
    // sqrt(9 + 16 + 0) = 5
    expect(dist).toBeCloseTo(5, 10);
  });

  it("scales correctly with a diagonal covariance", () => {
    // If invCov = diag(4, 1, 1), then distance for dx=[1,0,0] = sqrt(1*4*1)=2
    const invCov = [
      [4, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const dx = [1, 0, 0];
    expect(mahalanobisDistance(dx, invCov)).toBeCloseTo(2, 10);
  });

  it("returns 0 for a zero difference vector", () => {
    const dx = [0, 0, 0];
    expect(mahalanobisDistance(dx, identity3x3())).toBeCloseTo(0, 10);
  });
});
