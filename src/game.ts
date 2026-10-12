import { column, computeClues, type Puzzle } from "./puzzle";
import { arrangements, type Knowledge } from "./solver";

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

/** True when the filled cells of a row already match its clues, i.e. the line is complete. */
export function rowSatisfied(game: Game, row: number): boolean {
  return lineMatches(game.cells[row], game.puzzle.rowClues[row]);
}

export function colSatisfied(game: Game, col: number): boolean {
  return lineMatches(column(game.cells, col), game.puzzle.colClues[col]);
}

/** What the player can see: filled cells are always correct, crosses and errors read as empty. */
function playerKnowledge(cells: CellState[]): Knowledge[] {
  return cells.map((cell) => (cell === "filled" ? true : cell === "empty" ? null : false));
}

/**
 * For each clue number of a line, whether the player has found its block for sure:
 * the block sits at the same place in every arrangement consistent with what the
 * player sees, and all its cells are filled. Only visible information is used,
 * so greying a number never gives away the solution.
 */
function cluesFound(cells: CellState[], clues: number[]): boolean[] {
  if (lineMatches(cells, clues)) return clues.map(() => true);
  if (clues[0] === 0) return [false];
  const options = arrangements(clues, cells.length, playerKnowledge(cells));
  // No consistent arrangement means a misplaced cross: don't claim anything.
  if (options.length === 0) return clues.map(() => false);
  return clues.map((length, i) => {
    const start = options[0].starts[i];
    if (!options.every((option) => option.starts[i] === start)) return false;
    return cells.slice(start, start + length).every((cell) => cell === "filled");
  });
}

export function rowCluesFound(game: Game, row: number): boolean[] {
  return cluesFound(game.cells[row], game.puzzle.rowClues[row]);
}

export function colCluesFound(game: Game, col: number): boolean[] {
  return cluesFound(column(game.cells, col), game.puzzle.colClues[col]);
}
