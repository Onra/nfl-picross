export interface PuzzleData {
  id: string;
  title: string;
  palette: Record<string, string>;
  grid: string[];
}

export interface Puzzle {
  id: string;
  title: string;
  size: number;
  /** solution[row][col] is true when the cell must be filled. */
  solution: boolean[][];
  /** colors[row][col] is the reveal color of a filled cell, null for empty cells. */
  colors: (string | null)[][];
  rowClues: number[][];
  colClues: number[][];
}

export const EMPTY_CELL = ".";

/** Lengths of the consecutive filled runs in a line. An empty line yields [0]. */
export function computeClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) {
      run++;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

export function column<T>(grid: T[][], col: number): T[] {
  return grid.map((row) => row[col]);
}

export function parsePuzzle(data: PuzzleData): Puzzle {
  const size = data.grid.length;
  if (size === 0) throw new Error(`Puzzle "${data.id}" has an empty grid`);

  const colors = data.grid.map((line, row) => {
    if (line.length !== size) {
      throw new Error(`Puzzle "${data.id}": row ${row} has ${line.length} cells, expected ${size}`);
    }
    return [...line].map((key) => {
      if (key === EMPTY_CELL) return null;
      const color = data.palette[key];
      if (!color) throw new Error(`Puzzle "${data.id}": no palette color for "${key}"`);
      return color;
    });
  });

  const solution = colors.map((row) => row.map((color) => color !== null));
  return {
    id: data.id,
    title: data.title,
    size,
    solution,
    colors,
    rowClues: solution.map(computeClues),
    colClues: solution[0].map((_, col) => computeClues(column(solution, col))),
  };
}
