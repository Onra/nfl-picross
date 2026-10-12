import "./style.css";
import { SoundBoard } from "./audio";
import { parsePuzzle } from "./puzzle";
import { mountGame } from "./ui";
import playerData from "./puzzles/player.json";

mountGame(document.querySelector<HTMLElement>("#app")!, parsePuzzle(playerData), new SoundBoard());
