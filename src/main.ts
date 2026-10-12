import "./style.css";
import { SoundBoard } from "./audio";
import { mountHome } from "./home";
import { findPuzzle, nextPuzzle, PACKS } from "./puzzles";
import { mountGame } from "./ui";

const root = document.querySelector<HTMLElement>("#app")!;
const sound = new SoundBoard();
let cleanup = () => {};

// Audio can only start after a user gesture. iOS Safari only accepts some gestures
// (touchend, click), so listen to those as well.
for (const type of ["pointerdown", "touchend", "click"]) {
  window.addEventListener(type, () => sound.unlock(), { capture: true });
}

/** Hash routes: "#/" is the puzzle list, "#/play/<id>" a puzzle. */
function route(): void {
  cleanup();
  window.scrollTo(0, 0);
  const id = location.hash.match(/^#\/play\/(.+)$/)?.[1];
  const puzzle = id ? findPuzzle(id) : undefined;
  if (!puzzle) {
    cleanup = mountHome(root, sound);
    return;
  }
  const pack = PACKS.find((p) => p.puzzles.includes(puzzle))!;
  const number = String(pack.puzzles.indexOf(puzzle) + 1).padStart(2, "0");
  const next = nextPuzzle(puzzle.id);
  cleanup = mountGame(root, puzzle, sound, {
    label: `${pack.title} · #${number}`,
    onBack: () => (location.hash = "#/"),
    onNext: next ? () => (location.hash = `#/play/${next.id}`) : undefined,
  });
}

window.addEventListener("hashchange", route);
route();
