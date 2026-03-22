/**
 * General NxN matrix operations for Kalman filtering and IMM.
 *
 * Matrices are represented as `number[][]` where `m[row][col]`.
 */

/** Create an NxN identity matrix. */
export function identityNxN(n: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    m.push(row);
  }
  return m;
}

/** Create an NxN zero matrix. */
export function zerosNxN(n: number): number[][] {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

/** Element-wise addition of two NxN matrices. */
export function matNxNAdd(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) {
      row[j] = a[i][j] + b[i][j];
    }
    result.push(row);
  }
  return result;
}

/** Element-wise subtraction: A - B. */
export function matNxNSub(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) {
      row[j] = a[i][j] - b[i][j];
    }
    result.push(row);
  }
  return result;
}

/** Multiply two NxN matrices: C = A * B. Also handles NxM * MxP → NxP. */
export function matNxNMultiply(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += a[i][k] * b[k][j];
      }
      row[j] = sum;
    }
    result.push(row);
  }
  return result;
}

/** Multiply a matrix by a column vector: y = A * x. */
export function matVecMultiply(a: number[][], x: number[]): number[] {
  const n = a.length;
  const result = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < x.length; j++) {
      sum += a[i][j] * x[j];
    }
    result[i] = sum;
  }
  return result;
}

/** Scale every element of a matrix by a scalar. */
export function matNxNScale(m: number[][], s: number): number[][] {
  return m.map(row => row.map(v => v * s));
}

/** Transpose an NxM matrix. */
export function matNxNTranspose(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const result: number[][] = [];
  for (let j = 0; j < cols; j++) {
    const row = new Array(rows);
    for (let i = 0; i < rows; i++) {
      row[i] = m[i][j];
    }
    result.push(row);
  }
  return result;
}

/**
 * Compute the inverse of an NxN matrix using LU decomposition with
 * partial pivoting. Returns null if the matrix is singular.
 */
export function matNxNInverse(m: number[][]): number[][] | null {
  const n = m.length;
  // Build augmented matrix [m | I]
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(2 * n);
    for (let j = 0; j < n; j++) row[j] = m[i][j];
    for (let j = 0; j < n; j++) row[n + j] = i === j ? 1 : 0;
    aug.push(row);
  }

  // Gauss-Jordan elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-14) return null; // Singular

    // Swap rows
    if (maxRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    // Scale pivot row
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Extract inverse from right half
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    inv.push(aug[i].slice(n));
  }
  return inv;
}

/** Compute the outer product of two vectors: M[i][j] = a[i] * b[j]. */
export function outerProduct(a: number[], b: number[]): number[][] {
  return a.map(ai => b.map(bj => ai * bj));
}

/** Add a scalar times identity to a matrix: M + s * I. */
export function addScalarDiag(m: number[][], s: number): number[][] {
  const n = m.length;
  const result = m.map(row => [...row]);
  for (let i = 0; i < n; i++) {
    result[i][i] += s;
  }
  return result;
}

/** Compute the trace (sum of diagonal elements). */
export function trace(m: number[][]): number {
  let sum = 0;
  for (let i = 0; i < m.length; i++) sum += m[i][i];
  return sum;
}
