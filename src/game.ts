import { column, computeClues, type Puzzle } from "./puzzle";

/** `error` is a wrong fill: it shows as a red cross and can't be changed. */
export type CellState = "empty" | "filled" | "crossed" | "error";
export type Action = "fill" | "cross" | "erase";

export const MAX_PENALTY_MINUTES = 8;

export interface Game {
  puzzle: Puzzle;
  cells: CellState[][];
  errors: number;
  penaltyMinutes: number;
  solved: boolean;
}

export type ActionResult =
  | { kind: "ignored" }
  | { kind: "changed" }
  | { kind: "error"; penaltyMinutes: number }
  | { kind: "solved" };

export function newGame(puzzle: Puzzle): Game {
  return {
    puzzle,
    cells: puzzle.solution.map((row) => row.map((): CellState => "empty")),
    errors: 0,
    penaltyMinutes: 0,
    solved: false,
  };
}

/** Penalty for the nth error (1-based): 1, 2, 4, 8, 8, ... minutes. */
export function penaltyForError(n: number): number {
  return Math.min(2 ** (n - 1), MAX_PENALTY_MINUTES);
}

/** Mutates `game`. Correct fills and errors are final; crosses are never checked. */
export function applyAction(game: Game, row: number, col: number, action: Action): ActionResult {
  const current = game.cells[row][col];
  if (game.solved || current === "error" || current === "filled") return { kind: "ignored" };

  if (action === "erase") {
    if (current === "empty") return { kind: "ignored" };
    game.cells[row][col] = "empty";
    return { kind: "changed" };
  }

  if (action === "cross") {
    if (current === "crossed") return { kind: "ignored" };
    game.cells[row][col] = "crossed";
    return { kind: "changed" };
  }

  // fill: a crossed cell has to be erased first.
  if (current === "crossed") return { kind: "ignored" };
  if (!game.puzzle.solution[row][col]) {
    game.cells[row][col] = "error";
    game.errors++;
    const penaltyMinutes = penaltyForError(game.errors);
    game.penaltyMinutes += penaltyMinutes;
    return { kind: "error", penaltyMinutes };
  }

  game.cells[row][col] = "filled";
  if (isSolved(game)) {
    game.solved = true;
    game.cells = game.cells.map((r) => r.map((cell) => (cell === "filled" ? cell : "crossed")));
    return { kind: "solved" };
  }
  return { kind: "changed" };
}

export function isSolved(game: Game): boolean {
  return game.puzzle.solution.every((row, r) =>
    row.every((mustFill, c) => !mustFill || game.cells[r][c] === "filled"),
  );
}

function lineMatches(cells: CellState[], clues: number[]): boolean {
  const actual = computeClues(cells.map((cell) => cell === "filled"));
  return actual.length === clues.length && actual.every((n, i) => n === clues[i]);
}

/** True when the filled cells of a row already match its clues (used to grey them out). */
export function rowSatisfied(game: Game, row: number): boolean {
  return lineMatches(game.cells[row], game.puzzle.rowClues[row]);
}

export function colSatisfied(game: Game, col: number): boolean {
  return lineMatches(column(game.cells, col), game.puzzle.colClues[col]);
}
