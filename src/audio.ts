/**
 * Every sound is synthesized with the Web Audio API: no audio files, no licensing.
 * Browsers only allow audio after a user gesture, so nothing plays before `unlock()`.
 */

const STORAGE_KEY = "nfl-picross:audio";

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** C major pentatonic, used to make drag-painting climb in pitch. */
const PENTATONIC = [0, 2, 4, 7, 9];

// Background loop: 8 bars of eighth notes over Cmaj7 – Am7 – Fmaj7 – G6.
const BPM = 92;
const STEPS_PER_BAR = 8;
const CHORDS = [
  { bass: 36, notes: [60, 64, 67, 71] },
  { bass: 33, notes: [57, 60, 64, 67] },
  { bass: 29, notes: [53, 57, 60, 64] },
  { bass: 31, notes: [55, 59, 62, 64] },
];
const _ = null;
const MELODY: (number | null)[][] = [
  [76, _, 79, _, 81, 79, 76, _],
  [72, _, 76, _, 74, 72, 69, _],
  [69, 72, _, 74, 76, _, 72, _],
  [74, _, 71, _, 74, 76, 79, _],
  [84, _, 81, 79, _, 76, 79, _],
  [81, _, 79, 76, _, 74, 76, _],
  [77, _, 76, 74, _, 72, 74, _],
  [71, _, 74, _, 79, _, _, _],
];

interface Settings {
  music: boolean;
  sfx: boolean;
}

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { music: saved.music !== false, sfx: saved.sfx !== false };
  } catch {
    return { music: true, sfx: true };
  }
}

export class SoundBoard {
  settings = loadSettings();

  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;

  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(master);
      this.noise = this.makeNoise();
      if (this.settings.music) this.startMusic();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMusic(): boolean {
    this.settings.music = !this.settings.music;
    this.save();
    if (this.settings.music) this.startMusic();
    else this.stopMusic();
    return this.settings.music;
  }

  toggleSfx(): boolean {
    this.settings.sfx = !this.settings.sfx;
    this.save();
    return this.settings.sfx;
  }

  // ---- Sound effects ------------------------------------------------------

  /** `step` is the cell's position in the current drag: each one rings a note higher. */
  fill(step = 0): void {
    const ctx = this.sfx();
    if (!ctx) return;
    const octave = Math.floor(step / PENTATONIC.length);
    const midi = 72 + PENTATONIC[step % PENTATONIC.length] + 12 * Math.min(octave, 2);
    this.pluck(ctx.currentTime, midiToHz(midi), 0.22, 0.16);
  }

  cross(): void {
    const ctx = this.sfx();
    if (!ctx) return;
    this.noiseHit(ctx.currentTime, 2400, 0.05, 0.18);
  }

  erase(): void {
    const ctx = this.sfx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.08);
    this.envelope(osc, t, 0.1, 0.12);
  }

  error(): void {
    const ctx = this.sfx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [196, 147].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      osc.connect(filter);
      this.envelope(filter, t + i * 0.12, 0.16, 0.14, osc);
    });
  }

  /** A row or column was just completed. */
  line(): void {
    const ctx = this.sfx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [84, 88, 91].forEach((midi, i) => this.bell(t + i * 0.06, midiToHz(midi), 0.09, 0.5));
  }

  win(): void {
    const ctx = this.sfx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    this.duckMusic(t, 3.2);
    [72, 76, 79, 84].forEach((midi, i) => this.pluck(t + i * 0.11, midiToHz(midi), 0.2, 0.4));
    // Final chord, held.
    [60, 67, 72, 76, 79, 84].forEach((midi) => this.bell(t + 0.5, midiToHz(midi), 0.07, 2.2));
  }

  // ---- Music --------------------------------------------------------------

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.32, this.ctx.currentTime);
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    // Lookahead scheduler: timers are imprecise, so notes are scheduled slightly ahead.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  private stopMusic(): void {
    if (this.musicTimer === null || !this.ctx) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    // Fade out the notes already scheduled.
    const t = this.ctx.currentTime;
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0, t + 0.3);
  }

  private duckMusic(t: number, seconds: number): void {
    if (!this.ctx || this.musicTimer === null) return;
    const gain = this.musicBus.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0.32, t);
    gain.linearRampToValueAtTime(0.06, t + 0.15);
    gain.setValueAtTime(0.06, t + seconds);
    gain.linearRampToValueAtTime(0.32, t + seconds + 1.5);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const stepDuration = 60 / BPM / 2;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration;
      this.step = (this.step + 1) % (MELODY.length * STEPS_PER_BAR);
    }
  }

  private playStep(step: number, t: number, dur: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const beat = step % STEPS_PER_BAR;
    const chord = CHORDS[bar % CHORDS.length];
    const out = this.musicBus;

    // Bass on beats 1 and 3, with a pickup on the last eighth.
    if (beat === 0 || beat === 4) this.tone(t, midiToHz(chord.bass + 12), "triangle", 0.5, dur * 3, out);
    if (beat === 7) this.tone(t, midiToHz(chord.bass + 19), "triangle", 0.3, dur, out);

    // Soft keys on the off-beats.
    if (beat === 2 || beat === 6) {
      chord.notes.forEach((midi) => this.tone(t, midiToHz(midi), "sine", 0.07, dur * 1.6, out, 1800));
    }

    // Light percussion: kick on 1 and 3, snap on 2 and 4, hats on every eighth.
    if (beat === 0 || beat === 4) this.kick(t, out);
    if (beat === 2 || beat === 6) this.noiseHit(t, 1800, 0.06, 0.08, out);
    this.noiseHit(t, 8000, 0.02, beat % 2 === 0 ? 0.035 : 0.02, out);

    const note = MELODY[bar][beat];
    if (note !== null) this.bell(t, midiToHz(note), 0.11, dur * 1.8, out);
  }

  // ---- Instruments --------------------------------------------------------

  /** Returns the context if sound effects may play right now. */
  private sfx(): AudioContext | null {
    return this.settings.sfx && this.ctx ? this.ctx : null;
  }

  /** Connects `node` to `out` through an attack/decay envelope, then starts `source`. */
  private envelope(
    node: AudioNode,
    t: number,
    peak: number,
    decay: number,
    source = node as AudioScheduledSourceNode,
    out: AudioNode = this.sfxBus,
  ): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    node.connect(gain).connect(out);
    source.start(t);
    source.stop(t + decay + 0.05);
  }

  private tone(
    t: number,
    freq: number,
    type: OscillatorType,
    peak: number,
    decay: number,
    out: AudioNode,
    cutoff?: number,
  ): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (cutoff) {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      osc.connect(filter);
      this.envelope(filter, t, peak, decay, osc, out);
    } else {
      this.envelope(osc, t, peak, decay, osc, out);
    }
  }

  /** Short, woody pluck: triangle plus a quieter octave sine. */
  private pluck(t: number, freq: number, peak: number, decay: number, out: AudioNode = this.sfxBus): void {
    this.tone(t, freq, "triangle", peak, decay, out, 3500);
    this.tone(t, freq * 2, "sine", peak * 0.35, decay * 0.6, out);
  }

  /** Bell-like tone: sine plus an inharmonic partial that fades faster. */
  private bell(t: number, freq: number, peak: number, decay: number, out: AudioNode = this.sfxBus): void {
    this.tone(t, freq, "sine", peak, decay, out);
    this.tone(t, freq * 2.76, "sine", peak * 0.25, decay * 0.35, out);
  }

  private kick(t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this.envelope(osc, t, 0.35, 0.18, osc, out);
  }

  private noiseHit(t: number, freq: number, decay: number, peak: number, out: AudioNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = freq > 5000 ? "highpass" : "bandpass";
    filter.frequency.value = freq;
    src.connect(filter);
    this.envelope(filter, t, peak, decay, src, out);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage unavailable (private mode): settings just won't persist.
    }
  }
}
