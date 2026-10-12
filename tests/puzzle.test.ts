import { describe, expect, it } from "vitest";
import { computeClues, parsePuzzle } from "../src/puzzle";

const toLine = (s: string) => [...s].map((c) => c === "#");

describe("computeClues", () => {
  it("lists runs in order", () => {
    expect(computeClues(toLine("###.#..##."))).toEqual([3, 1, 2]);
  });

  it("handles runs touching both edges", () => {
    expect(computeClues(toLine("#........#"))).toEqual([1, 1]);
  });

  it("returns [0] for an empty line", () => {
    expect(computeClues(toLine(".........."))).toEqual([0]);
  });
});

describe("parsePuzzle", () => {
  const data = { id: "t", title: "T", palette: { A: "#000" }, grid: ["A.", ".A"] };

  it("derives solution, colors and clues", () => {
    const puzzle = parsePuzzle(data);
    expect(puzzle.size).toBe(2);
    expect(puzzle.solution).toEqual([[true, false], [false, true]]);
    expect(puzzle.colors).toEqual([["#000", null], [null, "#000"]]);
    expect(puzzle.rowClues).toEqual([[1], [1]]);
    expect(puzzle.colClues).toEqual([[1], [1]]);
  });

  it("rejects non-square grids", () => {
    expect(() => parsePuzzle({ ...data, grid: ["A.", "."] })).toThrow(/row 1/);
  });

  it("rejects unknown palette keys", () => {
    expect(() => parsePuzzle({ ...data, grid: ["Z.", ".A"] })).toThrow(/"Z"/);
  });
});
