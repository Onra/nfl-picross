import "./style.css";
import { parsePuzzle } from "./puzzle";
import { mountGame } from "./ui";
import playerData from "./puzzles/player.json";

mountGame(document.querySelector<HTMLElement>("#app")!, parsePuzzle(playerData));
