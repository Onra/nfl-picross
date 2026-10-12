import type { SoundBoard } from "./audio";
import { bindAudioToggles, BRAND_HTML, TOGGLES_HTML } from "./chrome";
import { bestResult } from "./progress";
import type { Puzzle } from "./puzzle";
import { ALL_PUZZLES, PACKS } from "./puzzles";
import { formatTime } from "./timer";

/** Pixel-art preview of a solved puzzle. */
function thumbnail(puzzle: Puzzle): string {
  const pixels = puzzle.colors
    .flat()
    .map((color) => `<i${color ? ` style="background:${color}"` : ""}></i>`)
    .join("");
  return `<div class="thumb" style="--size: ${puzzle.size}">${pixels}</div>`;
}

function tile(puzzle: Puzzle, number: number): string {
  const best = bestResult(puzzle.id);
  const label = String(number).padStart(2, "0");
  // Titles give the answer away, so they stay hidden until the puzzle is solved.
  return best
    ? `<a class="tile solved" href="#/play/${puzzle.id}" aria-label="${puzzle.title}, solved">
        ${thumbnail(puzzle)}
        <span class="tile-title">${puzzle.title}</span>
        <span class="tile-best">${formatTime(best.timeMs)}${best.errors === 0 ? " ★" : ""}</span>
      </a>`
    : `<a class="tile" href="#/play/${puzzle.id}" aria-label="Puzzle ${label}">
        <span class="tile-number">${label}</span>
        <span class="tile-size">${puzzle.size}×${puzzle.size}</span>
      </a>`;
}

export function mountHome(root: HTMLElement, sound: SoundBoard): () => void {
  const solvedCount = ALL_PUZZLES.filter((puzzle) => bestResult(puzzle.id)).length;

  const packs = PACKS.map((pack) => {
    const solved = pack.puzzles.filter((puzzle) => bestResult(puzzle.id)).length;
    return `
      <section class="pack">
        <header class="pack-header">
          <div>
            <h2>${pack.title}</h2>
            <p>${pack.subtitle}</p>
          </div>
          <span class="pack-count">${solved}/${pack.puzzles.length}</span>
        </header>
        <div class="tiles">
          ${pack.puzzles.map((puzzle, i) => tile(puzzle, i + 1)).join("")}
        </div>
      </section>
    `;
  }).join("");

  root.innerHTML = `
    <header class="scoreboard">
      ${BRAND_HTML}
      <div class="stat">
        <span class="stat-label">Solved</span>
        <span class="time">${solvedCount}/${ALL_PUZZLES.length}</span>
      </div>
      ${TOGGLES_HTML}
    </header>
    <main class="card home">${packs}</main>
  `;
  return bindAudioToggles(root, sound);
}
