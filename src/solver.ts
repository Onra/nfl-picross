/** A cell the solver has not decided yet is null. */
export type Knowledge = boolean | null;

export interface Arrangement {
  cells: boolean[];
  /** Start index of each block, in clue order. */
  starts: number[];
}

/** Every arrangement of `clues` in a line of `length` that agrees with `known`. */
export function arrangements(clues: number[], length: number, known: Knowledge[]): Arrangement[] {
  const blocks = clues[0] === 0 ? [] : clues;
  const results: Arrangement[] = [];
  const line: boolean[] = new Array(length).fill(false);
  const starts: number[] = [];

  const agrees = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (known[i] !== null && known[i] !== line[i]) return false;
    }
    return true;
  };

  const place = (blockIndex: number, start: number) => {
    if (blockIndex === blocks.length) {
      if (agrees(start, length)) results.push({ cells: [...line], starts: [...starts] });
      return;
    }
    const block = blocks[blockIndex];
    const remaining = blocks.slice(blockIndex + 1).reduce((sum, b) => sum + b + 1, 0);
    for (let pos = start; pos + block + remaining <= length; pos++) {
      line.fill(true, pos, pos + block);
      starts.push(pos);
      // The cells from `start` up to the end of the block, plus the separator after it.
      const end = Math.min(pos + block + 1, length);
      if (agrees(start, end)) place(blockIndex + 1, end);
      starts.pop();
      line.fill(false, pos, pos + block);
    }
  };

  place(0, 0);
  return results;
}

/** Cells forced by every arrangement of the line, or null if the line is contradictory. */
export function solveLine(clues: number[], known: Knowledge[]): Knowledge[] | null {
  const options = arrangements(clues, known.length, known);
  if (options.length === 0) return null;
  return known.map((_, i) => {
    const first = options[0].cells[i];
    return options.every((option) => option.cells[i] === first) ? first : null;
  });
}

/**
 * Solves a grid by line logic only (no guessing).
 * Returns the deduced grid; any null cell means logic alone cannot finish it.
 */
export function solveByLogic(rowClues: number[][], colClues: number[][]): Knowledge[][] {
  return runLogic(rowClues, colClues).grid;
}

/**
 * Number of passes over all rows then all columns that line logic needs to make
 * progress. A rough difficulty measure: 1-2 means the clues alone give the picture away.
 */
export function logicSweeps(rowClues: number[][], colClues: number[][]): number {
  return runLogic(rowClues, colClues).sweeps;
}

function runLogic(rowClues: number[][], colClues: number[][]): { grid: Knowledge[][]; sweeps: number } {
  const rows = rowClues.length;
  const cols = colClues.length;
  const grid: Knowledge[][] = Array.from({ length: rows }, () => new Array(cols).fill(null));

  let sweeps = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < rows; r++) {
      const solved = solveLine(rowClues[r], grid[r]);
      if (!solved) throw new Error(`Row ${r} is contradictory`);
      solved.forEach((value, c) => {
        if (value !== grid[r][c]) {
          grid[r][c] = value;
          changed = true;
        }
      });
    }
    for (let c = 0; c < cols; c++) {
      const solved = solveLine(colClues[c], grid.map((row) => row[c]));
      if (!solved) throw new Error(`Column ${c} is contradictory`);
      solved.forEach((value, r) => {
        if (value !== grid[r][c]) {
          grid[r][c] = value;
          changed = true;
        }
      });
    }
    if (changed) sweeps++;
  }
  return { grid, sweeps };
}
