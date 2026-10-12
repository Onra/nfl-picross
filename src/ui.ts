import {
  applyAction,
  colCluesFound,
  colSatisfied,
  newGame,
  rowCluesFound,
  rowSatisfied,
  type Action,
  type CellState,
  type Game,
} from "./game";
import type { Puzzle } from "./puzzle";
import { formatTime, Stopwatch, totalMs } from "./timer";
import type { SoundBoard } from "./audio";

interface Cell {
  row: number;
  col: number;
}

interface Drag {
  action: Action;
  start: Cell;
  /** Locked once the pointer leaves the starting cell. */
  axis: "row" | "col" | null;
  /** Cells filled so far in this drag, so each one rings a note higher. */
  fills: number;
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
const MUSIC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>`;
const SFX_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>`;

export function mountGame(root: HTMLElement, puzzle: Puzzle, sound: SoundBoard): void {
  let game: Game;
  let stopwatch: Stopwatch;
  let drag: Drag | null = null;
  let doneRows: boolean[] = [];
  let doneCols: boolean[] = [];

  root.innerHTML = `
    <header class="scoreboard">
      <div class="brand">
        <span class="brand-ball" aria-hidden="true"></span>
        <h1>NFL <span>Picross</span></h1>
      </div>
      <div class="stat">
        <span class="stat-label">Time</span>
        <span class="time">00:00</span>
        <span class="penalty" aria-live="polite"></span>
      </div>
      <div class="stat">
        <span class="stat-label">Errors</span>
        <span class="errors">0</span>
      </div>
      <div class="toggles">
        <button type="button" class="toggle music" aria-label="Music">${MUSIC_ICON}</button>
        <button type="button" class="toggle sfx" aria-label="Sound effects">${SFX_ICON}</button>
      </div>
    </header>
    <main class="card">
      <div class="board" style="--size: ${puzzle.size}"></div>
      <div class="win" hidden>
        <p class="win-banner">Touchdown!</p>
        <h2 class="win-title"></h2>
        <p class="win-time"></p>
        <button type="button" class="again">Play again</button>
      </div>
    </main>
    <p class="help"><kbd>Left click</kbd> fill <kbd>Right click</kbd> cross <kbd>Drag</kbd> paint a line</p>
  `;

  const board = root.querySelector<HTMLElement>(".board")!;
  const timeEl = root.querySelector<HTMLElement>(".time")!;
  const errorsEl = root.querySelector<HTMLElement>(".errors")!;
  const penaltyEl = root.querySelector<HTMLElement>(".penalty")!;
  const winEl = root.querySelector<HTMLElement>(".win")!;
  const musicBtn = root.querySelector<HTMLButtonElement>(".toggle.music")!;
  const sfxBtn = root.querySelector<HTMLButtonElement>(".toggle.sfx")!;

  // Board: a (size+1)² grid with the corner, column clues on top and row clues on the left.
  board.append(Object.assign(document.createElement("div"), { className: "corner" }));
  const colClueEls = puzzle.colClues.map((clues, c) => {
    const el = document.createElement("div");
    el.className = "clue col-clue";
    if (c % 5 === 0 && c > 0) el.classList.add("major-left");
    if (c % 2 === 1) el.classList.add("alt");
    el.innerHTML = clues.map((n) => `<span>${n}</span>`).join("");
    board.append(el);
    return el;
  });
  const rowClueEls: HTMLElement[] = [];
  const cellEls: HTMLElement[][] = [];
  for (let r = 0; r < puzzle.size; r++) {
    const clueEl = document.createElement("div");
    clueEl.className = "clue row-clue";
    if (r % 5 === 0 && r > 0) clueEl.classList.add("major-top");
    if (r % 2 === 1) clueEl.classList.add("alt");
    clueEl.innerHTML = puzzle.rowClues[r].map((n) => `<span>${n}</span>`).join("");
    board.append(clueEl);
    rowClueEls.push(clueEl);

    cellEls.push([]);
    for (let c = 0; c < puzzle.size; c++) {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);
      // Groups of 5 are set apart by a wider gap.
      if (c % 5 === 0 && c > 0) cellEl.classList.add("major-left");
      if (r % 5 === 0 && r > 0) cellEl.classList.add("major-top");
      // Staggered diagonal sweep for line flashes and the color reveal.
      cellEl.style.setProperty("--delay", `${(r + c) * 35}ms`);
      board.append(cellEl);
      cellEls[r].push(cellEl);
    }
  }

  function render(): void {
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        cellEls[r][c].dataset.state = game.cells[r][c];
      }
      renderClue(rowClueEls[r], doneRows[r], rowCluesFound(game, r));
    }
    colClueEls.forEach((el, c) => renderClue(el, doneCols[c], colCluesFound(game, c)));
    errorsEl.textContent = String(game.errors);
    renderTime();
  }

  /** Greys out each clue number whose block the player has found for sure. */
  function renderClue(el: HTMLElement, lineDone: boolean, found: boolean[]): void {
    el.classList.toggle("done", lineDone);
    [...el.children].forEach((span, i) => span.classList.toggle("found", found[i]));
  }

  function renderTime(): void {
    timeEl.textContent = formatTime(totalMs(stopwatch.elapsedMs(), game.penaltyMinutes));
  }

  /** Restarts a CSS animation by toggling its class. */
  function replay(el: HTMLElement, className: string): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function flashPenalty(minutes: number): void {
    penaltyEl.textContent = `+${minutes}:00`;
    replay(penaltyEl, "show");
    replay(timeEl, "hit");
  }

  /** Flashes rows and columns that just became satisfied. Returns true if any did. */
  function flashCompletedLines(): boolean {
    let any = false;
    for (let r = 0; r < puzzle.size; r++) {
      const done = rowSatisfied(game, r);
      if (done && !doneRows[r]) {
        any = true;
        replay(rowClueEls[r], "flash");
        cellEls[r].forEach((el) => replay(el, "flash"));
      }
      doneRows[r] = done;
    }
    for (let c = 0; c < puzzle.size; c++) {
      const done = colSatisfied(game, c);
      if (done && !doneCols[c]) {
        any = true;
        replay(colClueEls[c], "flash");
        cellEls.forEach((row) => replay(row[c], "flash"));
      }
      doneCols[c] = done;
    }
    return any;
  }

  function showWin(): void {
    stopwatch.stop();
    setHover(null);
    sound.win();
    board.classList.add("revealed");
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        const color = puzzle.colors[r][c];
        if (color) cellEls[r][c].style.setProperty("--reveal-color", color);
      }
    }
    render();
    winEl.querySelector(".win-title")!.textContent = puzzle.title;
    winEl.querySelector(".win-time")!.textContent =
      `${timeEl.textContent} · ` + (game.errors > 0 ? `${game.errors} error${game.errors > 1 ? "s" : ""}` : "Perfect game");
    winEl.hidden = false;
  }

  /** Applies the drag action to one cell. Returns false when the drag must stop. */
  function act(cell: Cell, action: Action): boolean {
    const result = applyAction(game, cell.row, cell.col, action);
    switch (result.kind) {
      case "ignored":
        return true;
      case "error":
        sound.error();
        flashPenalty(result.penaltyMinutes);
        return false;
      case "solved":
        flashCompletedLines();
        showWin();
        return false;
      case "changed":
        if (action === "fill") sound.fill(drag ? drag.fills++ : 0);
        else if (action === "cross") sound.cross();
        else sound.erase();
        if (flashCompletedLines()) sound.line();
        return true;
    }
  }

  function cellAt(target: EventTarget | null): Cell | null {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>(".cell");
    if (!el || !board.contains(el)) return null;
    return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
  }

  // Crosshair: highlight the hovered cell's row, column and their clues.
  let hover: Cell | null = null;
  function setHover(cell: Cell | null): void {
    if (hover?.row === cell?.row && hover?.col === cell?.col) return;
    const toggle = (on: boolean) => {
      if (!hover) return;
      rowClueEls[hover.row].classList.toggle("hl", on);
      colClueEls[hover.col].classList.toggle("hl", on);
      cellEls[hover.row].forEach((el) => el.classList.toggle("hl", on));
      cellEls.forEach((row) => row[hover!.col].classList.toggle("hl", on));
    };
    toggle(false);
    hover = cell && !game.solved ? cell : null;
    toggle(true);
  }

  board.addEventListener("contextmenu", (event) => event.preventDefault());
  board.addEventListener("pointerleave", () => setHover(null));

  board.addEventListener("pointerdown", (event) => {
    const cell = cellAt(event.target);
    if (!cell || game.solved) return;
    const action = actionFor(event.button, game.cells[cell.row][cell.col]);
    if (!action) return;
    event.preventDefault();
    drag = { action, start: cell, axis: null, fills: 0, last: cell };
    if (!act(cell, action)) drag = null;
    render();
  });

  board.addEventListener("pointerover", (event) => {
    const cell = cellAt(event.target);
    setHover(cell);
    if (!drag || !cell) return;
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

  // Audio can only start after a user gesture.
  window.addEventListener("pointerdown", () => sound.unlock(), { capture: true });

  function renderToggles(): void {
    musicBtn.classList.toggle("off", !sound.settings.music);
    musicBtn.setAttribute("aria-pressed", String(sound.settings.music));
    sfxBtn.classList.toggle("off", !sound.settings.sfx);
    sfxBtn.setAttribute("aria-pressed", String(sound.settings.sfx));
  }
  musicBtn.addEventListener("click", () => {
    sound.toggleMusic();
    renderToggles();
  });
  sfxBtn.addEventListener("click", () => {
    sound.toggleSfx();
    renderToggles();
  });
  renderToggles();

  function start(): void {
    game = newGame(puzzle);
    stopwatch = new Stopwatch();
    drag = null;
    doneRows = puzzle.rowClues.map((_, r) => rowSatisfied(game, r));
    doneCols = puzzle.colClues.map((_, c) => colSatisfied(game, c));
    board.classList.remove("revealed");
    winEl.hidden = true;
    render();
  }

  winEl.querySelector(".again")!.addEventListener("click", start);
  setInterval(renderTime, 250);
  start();
}
