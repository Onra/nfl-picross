import { parsePuzzle, type Puzzle, type PuzzleData } from "../puzzle";

export interface Pack {
  id: string;
  title: string;
  subtitle: string;
  puzzles: Puzzle[];
}

// Puzzles live in one folder per pack; the filename's numeric prefix sets the order.
const files = import.meta.glob<PuzzleData>("./*/*.json", { eager: true, import: "default" });

function loadPack(id: string, title: string, subtitle: string): Pack {
  const puzzles = Object.keys(files)
    .filter((path) => path.startsWith(`./${id}/`))
    .sort()
    .map((path) => parsePuzzle(files[path]));
  return { id, title, subtitle, puzzles };
}

export const PACKS: Pack[] = [
  loadPack("rookie", "Rookie", "5×5 · Learn the plays"),
  loadPack("pro", "Pro", "10×10 · Game day"),
  loadPack("hall-of-fame", "Hall of Fame", "15×15 · Legends only"),
];

export const ALL_PUZZLES = PACKS.flatMap((pack) => pack.puzzles);

export function findPuzzle(id: string): Puzzle | undefined {
  return ALL_PUZZLES.find((puzzle) => puzzle.id === id);
}

/** The puzzle after `id` in play order, across packs. */
export function nextPuzzle(id: string): Puzzle | undefined {
  const index = ALL_PUZZLES.findIndex((puzzle) => puzzle.id === id);
  return index >= 0 ? ALL_PUZZLES[index + 1] : undefined;
}
