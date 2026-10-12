import type { SoundBoard } from "./audio";

const MUSIC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>`;
// Speaker with sound waves; CSS shows the waves or the mute cross based on the level.
const VOLUME_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path class="wave-1" d="M16.5 8.5a5 5 0 0 1 0 7" /><path class="wave-2" d="M19 6a8.5 8.5 0 0 1 0 12" /><path class="mute" d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></svg>`;
export const BACK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>`;

export const BRAND_HTML = `
  <div class="brand">
    <span class="brand-ball" aria-hidden="true"></span>
    <h1>NFL <span>Picross</span></h1>
  </div>
`;

export const TOGGLES_HTML = `
  <div class="toggles">
    <button type="button" class="toggle music" aria-label="Music">${MUSIC_ICON}</button>
    <div class="volume">
      <button type="button" class="toggle volume-btn" aria-label="Volume" aria-expanded="false">${VOLUME_ICON}</button>
      <div class="volume-pop" hidden>
        <input type="range" min="0" max="100" step="1" aria-label="Volume" />
        <span class="volume-value"></span>
      </div>
    </div>
  </div>
`;

/** Wires the music toggle and volume slider rendered from TOGGLES_HTML. Returns a cleanup function. */
export function bindAudioToggles(root: HTMLElement, sound: SoundBoard): () => void {
  const musicBtn = root.querySelector<HTMLButtonElement>(".toggle.music")!;
  const volume = root.querySelector<HTMLElement>(".volume")!;
  const volumeBtn = volume.querySelector<HTMLButtonElement>(".volume-btn")!;
  const pop = volume.querySelector<HTMLElement>(".volume-pop")!;
  const slider = volume.querySelector<HTMLInputElement>("input")!;
  const valueEl = volume.querySelector<HTMLElement>(".volume-value")!;

  const renderMusic = () => {
    musicBtn.classList.toggle("off", !sound.settings.music);
    musicBtn.setAttribute("aria-pressed", String(sound.settings.music));
  };
  const renderVolume = () => {
    const percent = Math.round(sound.settings.volume * 100);
    slider.value = String(percent);
    slider.style.setProperty("--percent", `${percent}%`);
    valueEl.textContent = String(percent);
    volumeBtn.dataset.level = percent === 0 ? "mute" : percent < 50 ? "low" : "high";
  };
  const setOpen = (open: boolean) => {
    pop.hidden = !open;
    volumeBtn.setAttribute("aria-expanded", String(open));
  };

  musicBtn.addEventListener("click", () => {
    sound.toggleMusic();
    renderMusic();
  });
  volumeBtn.addEventListener("click", () => setOpen(pop.hidden !== false));
  slider.addEventListener("input", () => {
    sound.setVolume(Number(slider.value) / 100);
    renderVolume();
  });
  // A short blip on release lets the player hear the new level.
  slider.addEventListener("change", () => sound.fill(2));

  const closeOnOutside = (event: PointerEvent) => {
    if (!volume.contains(event.target as Node)) setOpen(false);
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
  };
  document.addEventListener("pointerdown", closeOnOutside);
  document.addEventListener("keydown", closeOnEscape);

  renderMusic();
  renderVolume();
  return () => {
    document.removeEventListener("pointerdown", closeOnOutside);
    document.removeEventListener("keydown", closeOnEscape);
  };
}
