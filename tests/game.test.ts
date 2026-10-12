import { describe, expect, it } from "vitest";
import { applyAction, newGame, penaltyForError, rowSatisfied, colSatisfied } from "../src/game";
import { parsePuzzle } from "../src/puzzle";
import { formatTime, Stopwatch, totalMs } from "../src/timer";

// #.
// ##
const puzzle = parsePuzzle({ id: "t", title: "T", palette: { A: "#000" }, grid: ["A.", "AA"] });

describe("applyAction", () => {
  it("fills a correct cell", () => {
    const game = newGame(puzzle);
    expect(applyAction(game, 0, 0, "fill")).toEqual({ kind: "changed" });
    expect(game.cells[0][0]).toBe("filled");
  });

  it("marks a wrong fill as an error with a doubling penalty", () => {
    const game = newGame(puzzle);
    expect(applyAction(game, 0, 1, "fill")).toEqual({ kind: "error", penaltyMinutes: 1 });
    expect(game.cells[0][1]).toBe("error");
    expect(game.errors).toBe(1);
    expect(game.penaltyMinutes).toBe(1);
  });

  it("never changes error or correctly filled cells", () => {
    const game = newGame(puzzle);
    applyAction(game, 0, 1, "fill");
    applyAction(game, 0, 0, "fill");
    for (const action of ["fill", "cross", "erase"] as const) {
      expect(applyAction(game, 0, 1, action)).toEqual({ kind: "ignored" });
      expect(applyAction(game, 0, 0, action)).toEqual({ kind: "ignored" });
    }
  });

  it("crosses and erases without checking the solution", () => {
    const game = newGame(puzzle);
    expect(applyAction(game, 0, 0, "cross")).toEqual({ kind: "changed" });
    expect(game.cells[0][0]).toBe("crossed");
    expect(applyAction(game, 0, 0, "fill")).toEqual({ kind: "ignored" });
    expect(applyAction(game, 0, 0, "erase")).toEqual({ kind: "changed" });
    expect(game.cells[0][0]).toBe("empty");
    expect(game.errors).toBe(0);
  });

  it("detects the win and crosses the remaining cells", () => {
    const game = newGame(puzzle);
    applyAction(game, 0, 0, "fill");
    applyAction(game, 1, 0, "fill");
    expect(applyAction(game, 1, 1, "fill")).toEqual({ kind: "solved" });
    expect(game.solved).toBe(true);
    expect(game.cells[0][1]).toBe("crossed");
    expect(applyAction(game, 0, 1, "erase")).toEqual({ kind: "ignored" });
  });
});

describe("penaltyForError", () => {
  it("doubles up to 8 minutes", () => {
    expect([1, 2, 3, 4, 5, 6].map(penaltyForError)).toEqual([1, 2, 4, 8, 8, 8]);
  });
});

describe("line satisfaction", () => {
  it("is true once a line's fills match its clues", () => {
    const game = newGame(puzzle);
    expect(rowSatisfied(game, 0)).toBe(false);
    applyAction(game, 0, 0, "fill");
    expect(rowSatisfied(game, 0)).toBe(true);
    expect(colSatisfied(game, 0)).toBe(false);
    applyAction(game, 1, 0, "fill");
    expect(colSatisfied(game, 0)).toBe(true);
  });
});

describe("timer", () => {
  it("adds penalty minutes to the elapsed time", () => {
    expect(totalMs(5_000, 3)).toBe(185_000);
  });

  it("formats mm:ss and h:mm:ss", () => {
    expect(formatTime(65_400)).toBe("01:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });

  it("freezes when stopped", () => {
    let now = 1_000;
    const stopwatch = new Stopwatch(() => now);
    now = 4_000;
    stopwatch.stop();
    now = 9_000;
    expect(stopwatch.elapsedMs()).toBe(3_000);
  });
});
