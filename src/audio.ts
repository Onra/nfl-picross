/**
 * Every sound is synthesized with the Web Audio API: no audio files, no licensing.
 * Browsers only allow audio after a user gesture, so nothing plays before `unlock()`.
 */

const STORAGE_KEY = "nfl-picross:audio";

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** C major pentatonic, used to make drag-painting climb in pitch. */
const PENTATONIC = [0, 2, 4, 7, 9];

// Background loop: an 8-bar stadium fight song in D major, chiptune style, in sixteenth notes.
const BPM = 132;
const STEPS_PER_BAR = 16;
const MUSIC_VOLUME = 0.3;

interface Bar {
  /** Bass root (MIDI). */
  root: number;
  /** Brass stab voicing (MIDI). */
  stab: number[];
  /** Lead notes as [midi, start step, length in steps]. */
  lead: [number, number, number][];
  /** Ends with a marching snare roll into the next phrase. */
  roll?: boolean;
}

const D = { root: 38, stab: [62, 66, 69, 74] };
const G = { root: 43, stab: [62, 67, 71, 74] };
const A = { root: 33, stab: [61, 64, 69, 73] };
const Bm = { root: 35, stab: [62, 66, 71, 74] };

const SONG: Bar[] = [
  { ...D, lead: [[74, 0, 3], [69, 3, 1], [74, 4, 2], [78, 6, 2], [81, 8, 6], [78, 14, 2]] },
  { ...G, lead: [[79, 0, 3], [78, 3, 1], [76, 4, 2], [74, 6, 2], [71, 8, 4], [74, 12, 4]] },
  { ...A, lead: [[76, 0, 2], [76, 2, 2], [78, 4, 2], [79, 6, 2], [81, 8, 4], [76, 12, 4]] },
  { ...D, lead: [[78, 0, 4], [74, 4, 4], [69, 8, 2], [74, 10, 2]], roll: true },
  { ...Bm, lead: [[71, 0, 3], [74, 3, 1], [78, 4, 4], [83, 8, 4], [81, 12, 4]] },
  { ...G, lead: [[79, 0, 3], [81, 3, 1], [83, 4, 4], [79, 8, 4], [74, 12, 4]] },
  { ...A, lead: [[76, 0, 2], [78, 2, 2], [79, 4, 2], [81, 6, 2], [83, 8, 2], [85, 10, 2], [86, 12, 4]] },
  { ...A, lead: [[88, 0, 6], [85, 6, 2], [81, 8, 2], [76, 10, 2]], roll: true },
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
  /** 25% duty pulse wave, the classic 8-bit lead timbre. */
  private pulse!: PeriodicWave;

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
      this.musicBus.gain.value = MUSIC_VOLUME;
      this.musicBus.connect(master);
      this.noise = this.makeNoise();
      this.pulse = this.makePulse(0.25);
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
    this.musicBus.gain.setValueAtTime(MUSIC_VOLUME, this.ctx.currentTime);
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
    gain.setValueAtTime(MUSIC_VOLUME, t);
    gain.linearRampToValueAtTime(MUSIC_VOLUME * 0.2, t + 0.15);
    gain.setValueAtTime(MUSIC_VOLUME * 0.2, t + seconds);
    gain.linearRampToValueAtTime(MUSIC_VOLUME, t + seconds + 1.5);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const stepDuration = 60 / BPM / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration;
      this.step = (this.step + 1) % (SONG.length * STEPS_PER_BAR);
    }
  }

  private playStep(step: number, t: number, dur: number): void {
    const barIndex = Math.floor(step / STEPS_PER_BAR);
    const bar = SONG[barIndex];
    const pos = step % STEPS_PER_BAR;
    const out = this.musicBus;

    // Bass bouncing between root and octave on every eighth.
    if (pos % 2 === 0) {
      const midi = bar.root + (pos % 4 === 0 ? 0 : 12);
      this.gated(t, midiToHz(midi), "triangle", 0.55, dur * 1.7, out);
    }

    // Brass stabs on the fight-song accents: 1, the "and" of 2, and 3.
    if (pos === 0 || pos === 6 || pos === 8) {
      bar.stab.forEach((midi) => this.tone(t, midiToHz(midi), "sawtooth", 0.05, dur * 2.2, out, 2600));
    }

    // Lead: pulse wave with a quiet octave echo for that arcade shimmer.
    for (const [midi, start, length] of bar.lead) {
      if (start !== pos) continue;
      this.gated(t, midiToHz(midi), this.pulse, 0.11, dur * length * 0.92, out);
      this.gated(t + dur * 0.75, midiToHz(midi + 12), this.pulse, 0.025, dur * length * 0.6, out);
    }

    // Drumline: kick on 1, 3 and the "and" of 3; snare on 2 and 4; sixteenth hats.
    if (pos === 0 || pos === 8 || pos === 10) this.kick(t, out);
    if (pos === 4 || pos === 12) this.snare(t, 0.22, out);
    this.noiseHit(t, 9000, 0.025, pos % 4 === 2 ? 0.05 : 0.025, out);
    if (bar.roll && pos >= 12) this.snare(t, 0.08 + (pos - 12) * 0.04, out);

    // Crowd "HEY!" at the end of each 4-bar phrase.
    if (bar.roll && pos === 14) this.hey(t, out);
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

  /** Held note: quick attack, sustain, short release. Used for chiptune bass and lead. */
  private gated(
    t: number,
    freq: number,
    wave: OscillatorType | PeriodicWave,
    peak: number,
    length: number,
    out: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
    else osc.type = wave;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.004);
    gain.gain.setValueAtTime(peak * 0.8, t + 0.03);
    gain.gain.setValueAtTime(peak * 0.8, t + length);
    gain.gain.linearRampToValueAtTime(0, t + length + 0.03);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  /** Marching snare: a noise crack over a short tonal body. */
  private snare(t: number, peak: number, out: AudioNode): void {
    this.noiseHit(t, 2200, 0.09, peak, out);
    this.tone(t, 190, "triangle", peak * 0.6, 0.06, out);
  }

  /** A crowd shout, faked with stacked band-passed noise and a falling vowel-ish tone. */
  private hey(t: number, out: AudioNode): void {
    [700, 1150, 2400].forEach((freq) => this.noiseHit(t, freq, 0.22, 0.09, out));
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 2;
    osc.connect(filter);
    this.envelope(filter, t, 0.06, 0.22, osc, out);
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

  private makePulse(duty: number): PeriodicWave {
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return this.ctx!.createPeriodicWave(real, imag);
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
