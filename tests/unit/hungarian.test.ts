import { describe, expect, it } from "vitest";
import { solveAssignment } from "@/lib/engines/hungarian";
import { createPrng, type Prng } from "./helpers/prng";

type Matrix = number[][];

function cell(matrix: Matrix, row: number, column: number): number {
  const value = matrix[row]?.[column];
  if (value === undefined) throw new Error(`no cell at ${row},${column}`);
  return value;
}

function totalCost(matrix: Matrix, assignment: readonly number[]): number {
  return assignment.reduce((sum, column, row) => sum + cell(matrix, row, column), 0);
}

/** Exhaustive search over every injective row → column mapping. */
function bruteForceMinimum(matrix: Matrix): number {
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  const used = new Array<boolean>(columns).fill(false);
  let best = Infinity;
  const visit = (row: number, running: number): void => {
    if (row === rows) {
      if (running < best) best = running;
      return;
    }
    for (let column = 0; column < columns; column += 1) {
      if (used[column]) continue;
      used[column] = true;
      visit(row + 1, running + cell(matrix, row, column));
      used[column] = false;
    }
  };
  visit(0, 0);
  return best;
}

function randomMatrix(prng: Prng, rows: number, columns: number, make: () => number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, make));
}

function expectValidAssignment(matrix: Matrix, assignment: readonly number[]): void {
  const columns = matrix[0]?.length ?? 0;
  expect(assignment).toHaveLength(matrix.length);
  for (const column of assignment) {
    expect(Number.isInteger(column)).toBe(true);
    expect(column).toBeGreaterThanOrEqual(0);
    expect(column).toBeLessThan(columns);
  }
  expect(new Set(assignment).size).toBe(assignment.length);
}

describe("solveAssignment", () => {
  it("returns an empty assignment for an empty matrix", () => {
    expect(solveAssignment([])).toEqual([]);
  });

  it("solves a 1×1 matrix", () => {
    expect(solveAssignment([[7]])).toEqual([0]);
  });

  it("picks the cheapest column for a single row", () => {
    expect(solveAssignment([[5, 2, 9, 4]])).toEqual([1]);
  });

  it("solves a textbook 3×3 example", () => {
    // Optimal: row0→col1 (1), row1→col0 (2), row2→col2 (2) = 5
    const matrix = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const assignment = solveAssignment(matrix);
    expect(assignment).toEqual([1, 0, 2]);
    expect(totalCost(matrix, assignment)).toBe(5);
  });

  it("does not fall for the greedy choice", () => {
    // Greedy takes (0,0)=1 then is forced into (1,1)=100. Optimal is 2 + 3 = 5.
    const matrix = [
      [1, 2],
      [3, 100],
    ];
    expect(solveAssignment(matrix)).toEqual([1, 0]);
  });

  it("handles rectangular matrices with more columns than rows", () => {
    const matrix = [
      [10, 10, 1, 10, 10],
      [10, 10, 2, 10, 3],
    ];
    const assignment = solveAssignment(matrix);
    expectValidAssignment(matrix, assignment);
    // Row 0 keeps column 2 (1); row 1 takes column 4 (3) → 4.
    expect(assignment).toEqual([2, 4]);
  });

  it("throws when there are more rows than columns", () => {
    expect(() => solveAssignment([[1], [2]])).toThrow(/at least as many columns as rows/);
    expect(() =>
      solveAssignment([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
    ).toThrow(Error);
  });

  it("throws for rows with no columns", () => {
    expect(() => solveAssignment([[]])).toThrow(Error);
  });

  it("handles negative costs", () => {
    const matrix = [
      [-5, 0],
      [-9, -1],
    ];
    // (0→1, 1→0) = 0 − 9 = −9 beats (0→0, 1→1) = −6.
    expect(solveAssignment(matrix)).toEqual([1, 0]);
  });

  it("handles a matrix of identical costs", () => {
    const matrix = [
      [3, 3, 3],
      [3, 3, 3],
      [3, 3, 3],
    ];
    const assignment = solveAssignment(matrix);
    expectValidAssignment(matrix, assignment);
    expect(totalCost(matrix, assignment)).toBe(9);
  });

  it("does not mutate its input", () => {
    const matrix = [
      [4, 1, 3],
      [2, 0, 5],
    ];
    const copy = matrix.map((row) => [...row]);
    solveAssignment(matrix);
    expect(matrix).toEqual(copy);
  });

  it("avoids large 'forbidden' costs whenever a feasible alternative exists", () => {
    const BIG = 1e9;
    const matrix = [
      [BIG, 4, BIG],
      [3, BIG, BIG],
      [BIG, 1, 8],
    ];
    expect(solveAssignment(matrix)).toEqual([1, 0, 2]);
  });

  it("is optimal on 300 seeded random square integer matrices (vs brute force)", () => {
    const prng = createPrng(20260301);
    for (let trial = 0; trial < 300; trial += 1) {
      const size = prng.int(1, 6);
      const matrix = randomMatrix(prng, size, size, () => prng.int(0, 20));
      const assignment = solveAssignment(matrix);
      expectValidAssignment(matrix, assignment);
      expect(totalCost(matrix, assignment), `trial ${trial}: ${JSON.stringify(matrix)}`).toBe(bruteForceMinimum(matrix));
    }
  });

  it("is optimal on 300 seeded random rectangular matrices (vs brute force)", () => {
    const prng = createPrng(77);
    for (let trial = 0; trial < 300; trial += 1) {
      const rows = prng.int(1, 5);
      const columns = prng.int(rows, 7);
      const matrix = randomMatrix(prng, rows, columns, () => prng.int(-10, 30));
      const assignment = solveAssignment(matrix);
      expectValidAssignment(matrix, assignment);
      expect(totalCost(matrix, assignment), `trial ${trial}: ${JSON.stringify(matrix)}`).toBe(bruteForceMinimum(matrix));
    }
  });

  it("is optimal on 200 seeded random real-valued matrices (vs brute force)", () => {
    const prng = createPrng(4242);
    for (let trial = 0; trial < 200; trial += 1) {
      const rows = prng.int(1, 5);
      const columns = prng.int(rows, 6);
      const matrix = randomMatrix(prng, rows, columns, () => prng.float(0, 1000));
      const assignment = solveAssignment(matrix);
      expectValidAssignment(matrix, assignment);
      expect(totalCost(matrix, assignment)).toBeCloseTo(bruteForceMinimum(matrix), 6);
    }
  });

  it("is optimal on sparse matrices where many pairings are forbidden with a large finite cost", () => {
    const prng = createPrng(909);
    const BIG = 1e7;
    for (let trial = 0; trial < 200; trial += 1) {
      const rows = prng.int(2, 5);
      const columns = prng.int(rows, 6);
      const matrix = randomMatrix(prng, rows, columns, () => (prng.next() < 0.4 ? BIG : prng.int(1, 50)));
      const assignment = solveAssignment(matrix);
      expectValidAssignment(matrix, assignment);
      expect(totalCost(matrix, assignment)).toBe(bruteForceMinimum(matrix));
    }
  });
});
