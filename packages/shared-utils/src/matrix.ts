/**
 * Small 3x3 matrix math for covariance operations.
 *
 * Matrices are represented as `number[][]` where `m[row][col]`.
 */

type Mat3 = number[][];

/** Return the 3x3 identity matrix. */
export function identity3x3(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

/** Multiply two 3x3 matrices: C = A * B. */
export function mat3x3Multiply(a: Mat3, b: Mat3): Mat3 {
  const c: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }

  return c;
}

/** Element-wise addition of two 3x3 matrices. */
export function mat3x3Add(a: Mat3, b: Mat3): Mat3 {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1], a[0][2] + b[0][2]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1], a[1][2] + b[1][2]],
    [a[2][0] + b[2][0], a[2][1] + b[2][1], a[2][2] + b[2][2]],
  ];
}

/**
 * Compute the inverse of a 3x3 matrix using the adjugate method.
 *
 * @returns The inverse matrix, or `null` if the matrix is singular
 *          (determinant is effectively zero).
 */
export function mat3x3Inverse(m: Mat3): Mat3 | null {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, k],
  ] = m;

  // Cofactors
  const A = e * k - f * h;
  const B = -(d * k - f * g);
  const C = d * h - e * g;
  const D = -(b * k - c * h);
  const E = a * k - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const K = a * e - b * d;

  const det = a * A + b * B + c * C;

  if (Math.abs(det) < 1e-14) {
    return null;
  }

  const invDet = 1 / det;

  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, K * invDet],
  ];
}

/** Transpose a 3x3 matrix. */
export function mat3x3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/** Scale every element of a 3x3 matrix by a scalar. */
export function mat3x3Scale(m: Mat3, s: number): Mat3 {
  return [
    [m[0][0] * s, m[0][1] * s, m[0][2] * s],
    [m[1][0] * s, m[1][1] * s, m[1][2] * s],
    [m[2][0] * s, m[2][1] * s, m[2][2] * s],
  ];
}

/**
 * Mahalanobis distance: sqrt( dx^T * invCov * dx ).
 *
 * @param dx     Difference vector (length 3).
 * @param invCov Inverse covariance matrix (3x3).
 * @returns The scalar Mahalanobis distance.
 */
export function mahalanobisDistance(dx: number[], invCov: Mat3): number {
  // Compute dx^T * invCov * dx
  let result = 0;
  for (let i = 0; i < 3; i++) {
    let rowProduct = 0;
    for (let j = 0; j < 3; j++) {
      rowProduct += invCov[i][j] * dx[j];
    }
    result += dx[i] * rowProduct;
  }

  return Math.sqrt(Math.abs(result));
}
