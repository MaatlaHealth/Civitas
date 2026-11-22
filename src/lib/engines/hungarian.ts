/**
 * Minimum-cost assignment (Hungarian / Kuhn–Munkres algorithm, O(n²·m)).
 *
 * Given a cost matrix with `rows ≤ columns`, assigns every row to a distinct
 * column so that the total cost is minimal. Costs must be finite; callers
 * represent forbidden pairings with a large finite cost and discard them
 * afterwards.
 *
 * This is the classic shortest-augmenting-path formulation using row and
 * column potentials (u, v). `way[j]` records the previous column on the
 * augmenting path so the matching can be updated once a free column is found.
 */
export function solveAssignment(cost: readonly (readonly number[])[]): number[] {
  const rowCount = cost.length;
  const columnCount = cost[0]?.length ?? 0;
  if (rowCount === 0) return [];
  if (rowCount > columnCount) {
    throw new Error("solveAssignment requires at least as many columns as rows.");
  }

  // Index 0 is a sentinel; rows and columns are 1-based internally.
  const u = new Array<number>(rowCount + 1).fill(0);
  const v = new Array<number>(columnCount + 1).fill(0);
  const matchedRow = new Array<number>(columnCount + 1).fill(0);
  const way = new Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minSlack = new Array<number>(columnCount + 1).fill(Infinity);
    const visited = new Array<boolean>(columnCount + 1).fill(false);

    do {
      visited[currentColumn] = true;
      const activeRow = matchedRow[currentColumn]!;
      let delta = Infinity;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column += 1) {
        if (visited[column]) continue;
        const reduced = cost[activeRow - 1]![column - 1]! - u[activeRow]! - v[column]!;
        if (reduced < minSlack[column]!) {
          minSlack[column] = reduced;
          way[column] = currentColumn;
        }
        if (minSlack[column]! < delta) {
          delta = minSlack[column]!;
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column += 1) {
        if (visited[column]) {
          u[matchedRow[column]!]! += delta;
          v[column]! -= delta;
        } else {
          minSlack[column]! -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const previousColumn = way[currentColumn]!;
      matchedRow[currentColumn] = matchedRow[previousColumn]!;
      currentColumn = previousColumn;
    } while (currentColumn !== 0);
  }

  const assignment = new Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    const row = matchedRow[column]!;
    if (row !== 0) assignment[row - 1] = column - 1;
  }
  return assignment;
}
