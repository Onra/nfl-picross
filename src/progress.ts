/** Best results per puzzle, kept in this browser only. */

const STORAGE_KEY = "nfl-picross:progress";

export interface Result {
  /** Total time including penalties. */
  timeMs: number;
  errors: number;
}

type Progress = Record<string, Result>;

function load(): Progress {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

export function bestResult(puzzleId: string): Result | undefined {
  return load()[puzzleId];
}

/** Records a solve and returns true if it beats the previous best time. */
export function recordResult(puzzleId: string, result: Result): boolean {
  const progress = load();
  const previous = progress[puzzleId];
  if (previous && previous.timeMs <= result.timeMs) return false;
  progress[puzzleId] = result;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable (private mode): progress just won't persist.
  }
  return true;
}
