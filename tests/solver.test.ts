import { describe, expect, it } from "vitest";
import { parsePuzzle, type PuzzleData } from "../src/puzzle";
import { solveByLogic, solveLine } from "../src/solver";

const puzzleFiles = import.meta.glob<PuzzleData>("../src/puzzles/*.json", {
  eager: true,
  import: "default",
});

describe("solveLine", () => {
  it("fills the overlap of a long block", () => {
    const line = solveLine([7], new Array(10).fill(null));
    expect(line).toEqual([null, null, null, true, true, true, true, null, null, null]);
  });

  it("solves a line with no slack completely", () => {
    const line = solveLine([4, 5], new Array(10).fill(null));
    expect(line).toEqual([true, true, true, true, false, true, true, true, true, true]);
  });

  it("crosses every cell of an empty line", () => {
    expect(solveLine([0], new Array(5).fill(null))).toEqual(new Array(5).fill(false));
  });

  it("detects a contradiction", () => {
    expect(solveLine([3], [false, true, false, null, null])).toBeNull();
  });
});

describe("puzzles", () => {
  it("has at least one puzzle", () => {
    expect(Object.keys(puzzleFiles).length).toBeGreaterThan(0);
  });

  for (const [file, data] of Object.entries(puzzleFiles)) {
    it(`${file} has a unique solution reachable by logic alone`, () => {
      const puzzle = parsePuzzle(data);
      const solved = solveByLogic(puzzle.rowClues, puzzle.colClues);
      expect(solved).toEqual(puzzle.solution);
    });
  }
});
