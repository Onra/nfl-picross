import {
  applyAction,
  colSatisfied,
  newGame,
  rowSatisfied,
  type Action,
  type CellState,
  type Game,
} from "./game";
import type { Puzzle } from "./puzzle";
import { formatTime, Stopwatch, totalMs } from "./timer";

interface Cell {
  row: number;
  col: number;
}

interface Drag {
  action: Action;
  start: Cell;
  /** Locked once the pointer leaves the starting cell. */
  axis: "row" | "col" | null;
  /** Furthest cell reached along the axis, so going back doesn't re-apply. */
  last: Cell;
}

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

/** Which action a press starts, given the button and the pressed cell. */
function actionFor(button: number, state: CellState): Action | null {
  if (button === LEFT_BUTTON) {
    if (state === "empty") return "fill";
    if (state === "crossed") return "erase";
  }
  if (button === RIGHT_BUTTON) {
    if (state === "empty") return "cross";
    if (state === "crossed") return "erase";
  }
  return null;
}

/** Cells strictly after `from` up to `to`, along one axis. */
function cellsBetween(from: Cell, to: Cell, axis: "row" | "col"): Cell[] {
  const cells: Cell[] = [];
  if (axis === "row") {
    const step = Math.sign(to.col - from.col);
    for (let c = from.col + step; step !== 0 && c !== to.col + step; c += step) {
      cells.push({ row: from.row, col: c });
    }
  } else {
    const step = Math.sign(to.row - from.row);
    for (let r = from.row + step; step !== 0 && r !== to.row + step; r += step) {
      cells.push({ row: r, col: from.col });
    }
  }
  return cells;
}

export function mountGame(root: HTMLElement, puzzle: Puzzle): void {
  let game: Game;
  let stopwatch: Stopwatch;
  let drag: Drag | null = null;

  root.innerHTML = `
    <header class="hud">
      <h1>NFL Picross</h1>
      <div class="stats">
        <span class="time" aria-label="Time">00:00</span>
        <span class="errors" aria-label="Errors">Errors: 0</span>
      </div>
      <span class="penalty" aria-live="polite"></span>
    </header>
    <div class="board" style="--size: ${puzzle.size}"></div>
    <div class="win" hidden>
      <h2 class="win-title"></h2>
      <p class="win-time"></p>
      <button type="button" class="again">Play again</button>
    </div>
    <p class="help">Left click: fill · Right click: cross · Hold and drag to paint a line</p>
  `;

  const board = root.querySelector<HTMLElement>(".board")!;
  const timeEl = root.querySelector<HTMLElement>(".time")!;
  const errorsEl = root.querySelector<HTMLElement>(".errors")!;
  const penaltyEl = root.querySelector<HTMLElement>(".penalty")!;
  const winEl = root.querySelector<HTMLElement>(".win")!;

  // Board: a (size+1)² grid with the corner, column clues on top and row clues on the left.
  board.append(document.createElement("div"));
  const colClueEls = puzzle.colClues.map((clues) => {
    const el = document.createElement("div");
    el.className = "clue col-clue";
    el.innerHTML = clues.map((n) => `<span>${n}</span>`).join("");
    board.append(el);
    return el;
  });
  const rowClueEls: HTMLElement[] = [];
  const cellEls: HTMLElement[][] = [];
  for (let r = 0; r < puzzle.size; r++) {
    const clueEl = document.createElement("div");
    clueEl.className = "clue row-clue";
    clueEl.innerHTML = puzzle.rowClues[r].map((n) => `<span>${n}</span>`).join("");
    board.append(clueEl);
    rowClueEls.push(clueEl);

    cellEls.push([]);
    for (let c = 0; c < puzzle.size; c++) {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);
      // Outer frame and the thicker line every 5 cells.
      if (c % 5 === 0) cellEl.classList.add("major-left");
      if (r % 5 === 0) cellEl.classList.add("major-top");
      if (c === puzzle.size - 1) cellEl.classList.add("edge-right");
      if (r === puzzle.size - 1) cellEl.classList.add("edge-bottom");
      // Staggered diagonal sweep for the color reveal.
      cellEl.style.setProperty("--reveal-delay", `${(r + c) * 40}ms`);
      board.append(cellEl);
      cellEls[r].push(cellEl);
    }
  }

  function render(): void {
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        cellEls[r][c].dataset.state = game.cells[r][c];
      }
      rowClueEls[r].classList.toggle("done", rowSatisfied(game, r));
    }
    colClueEls.forEach((el, c) => el.classList.toggle("done", colSatisfied(game, c)));
    errorsEl.textContent = `Errors: ${game.errors}`;
    renderTime();
  }

  function renderTime(): void {
    timeEl.textContent = formatTime(totalMs(stopwatch.elapsedMs(), game.penaltyMinutes));
  }

  function flashPenalty(minutes: number): void {
    penaltyEl.textContent = `+${minutes} min`;
    penaltyEl.classList.remove("show");
    void penaltyEl.offsetWidth; // restart the animation
    penaltyEl.classList.add("show");
  }

  function showWin(): void {
    stopwatch.stop();
    renderTime();
    board.classList.add("revealed");
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        const color = puzzle.colors[r][c];
        if (color) cellEls[r][c].style.setProperty("--reveal-color", color);
      }
    }
    winEl.querySelector(".win-title")!.textContent = puzzle.title;
    winEl.querySelector(".win-time")!.textContent =
      `Time: ${timeEl.textContent}` + (game.errors > 0 ? ` (${game.errors} errors)` : " · Perfect!");
    winEl.hidden = false;
  }

  /** Applies the drag action to one cell. Returns false when the drag must stop. */
  function act(cell: Cell, action: Action): boolean {
    const result = applyAction(game, cell.row, cell.col, action);
    if (result.kind === "error") flashPenalty(result.penaltyMinutes);
    if (result.kind === "solved") showWin();
    return result.kind !== "error" && result.kind !== "solved";
  }

  function cellAt(target: EventTarget | null): Cell | null {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>(".cell");
    if (!el || !board.contains(el)) return null;
    return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
  }

  board.addEventListener("contextmenu", (event) => event.preventDefault());

  board.addEventListener("pointerdown", (event) => {
    const cell = cellAt(event.target);
    if (!cell || game.solved) return;
    const action = actionFor(event.button, game.cells[cell.row][cell.col]);
    if (!action) return;
    event.preventDefault();
    drag = { action, start: cell, axis: null, last: cell };
    if (!act(cell, action)) drag = null;
    render();
  });

  board.addEventListener("pointerover", (event) => {
    if (!drag) return;
    const cell = cellAt(event.target);
    if (!cell) return;
    const { start } = drag;
    if (!drag.axis) {
      if (cell.row === start.row && cell.col !== start.col) drag.axis = "row";
      else if (cell.col === start.col && cell.row !== start.row) drag.axis = "col";
      else return;
    }
    // Project the pointer onto the locked axis, then paint every cell from the last one reached.
    const target = drag.axis === "row" ? { row: start.row, col: cell.col } : { row: cell.row, col: start.col };
    const beyondLast =
      drag.axis === "row"
        ? Math.abs(target.col - start.col) > Math.abs(drag.last.col - start.col)
        : Math.abs(target.row - start.row) > Math.abs(drag.last.row - start.row);
    if (!beyondLast) return;
    for (const next of cellsBetween(drag.last, target, drag.axis)) {
      drag.last = next;
      if (!act(next, drag.action)) {
        drag = null;
        break;
      }
    }
    render();
  });

  window.addEventListener("pointerup", () => {
    drag = null;
  });

  function start(): void {
    game = newGame(puzzle);
    stopwatch = new Stopwatch();
    drag = null;
    board.classList.remove("revealed");
    winEl.hidden = true;
    render();
  }

  winEl.querySelector(".again")!.addEventListener("click", start);
  setInterval(renderTime, 250);
  start();
}
