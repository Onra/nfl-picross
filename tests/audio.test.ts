import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundBoard } from "../src/audio";

/** Any Web Audio node or param: every method is a no-op, every property another stub. */
function stub(): any {
  const props: Record<PropertyKey, unknown> = {};
  return new Proxy(function () {}, {
    get: (_target, key) => (props[key] ??= stub()),
    apply: () => stub(),
  });
}

/** Just enough of an AudioContext to drive SoundBoard, with a controllable state and clock. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState | "interrupted" = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = stub();
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain = () => stub();
  createOscillator = () => stub();
  createBiquadFilter = () => stub();
  createBufferSource = () => stub();
  createPeriodicWave = () => stub();
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
}

class FakeAudioElement {
  static instances: FakeAudioElement[] = [];
  paused = true;
  loop = false;
  constructor(public src: string) {
    FakeAudioElement.instances.push(this);
  }
  setAttribute() {}
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

let listeners: Record<string, () => void>;
let hidden: boolean;

function setUp(nav: Record<string, unknown>) {
  FakeAudioContext.instances = [];
  FakeAudioElement.instances = [];
  listeners = {};
  hidden = false;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("Audio", FakeAudioElement);
  vi.stubGlobal("PeriodicWave", class {});
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0", platform: "Linux", maxTouchPoints: 0, ...nav });
  vi.stubGlobal("document", {
    get hidden() {
      return hidden;
    },
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
  });
  vi.stubGlobal("window", { setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:silence" });
}

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15";

describe("SoundBoard on iOS", () => {
  afterEach(() => vi.unstubAllGlobals());

  describe("with the Audio Session API (iOS 17+)", () => {
    let session: { type: string };
    beforeEach(() => {
      session = { type: "auto" };
      setUp({ userAgent: IPHONE_UA, audioSession: session });
    });

    it("plays through the silent switch", () => {
      new SoundBoard().unlock();
      expect(session.type).toBe("playback");
      expect(FakeAudioElement.instances).toHaveLength(0);
    });

    it("resumes the context created in the gesture", () => {
      new SoundBoard().unlock();
      expect(FakeAudioContext.instances[0].resume).toHaveBeenCalled();
    });
  });

  describe("without the Audio Session API (older iOS)", () => {
    beforeEach(() => setUp({ userAgent: IPHONE_UA }));

    it("plays a looping silent audio element to lift the silent switch", () => {
      new SoundBoard().unlock();
      const [keepAlive] = FakeAudioElement.instances;
      expect(keepAlive.loop).toBe(true);
      expect(keepAlive.play).toHaveBeenCalled();
    });

    it("detects iPadOS, which reports itself as a Mac", () => {
      setUp({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 });
      new SoundBoard().unlock();
      expect(FakeAudioElement.instances).toHaveLength(1);
    });
  });

  it("does not use the silent-audio workaround off iOS", () => {
    setUp({});
    new SoundBoard().unlock();
    expect(FakeAudioElement.instances).toHaveLength(0);
  });

  it("revives a context iOS interrupted (call, other app) on the next gesture", () => {
    setUp({ userAgent: IPHONE_UA, audioSession: { type: "auto" } });
    const sound = new SoundBoard();
    sound.unlock();
    const ctx = FakeAudioContext.instances[0];
    ctx.state = "interrupted";
    ctx.resume.mockClear();
    sound.unlock();
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("suspends audio in the background and resumes it in the foreground", () => {
    setUp({ userAgent: IPHONE_UA });
    new SoundBoard().unlock();
    const ctx = FakeAudioContext.instances[0];
    const [keepAlive] = FakeAudioElement.instances;

    hidden = true;
    listeners.visibilitychange();
    expect(ctx.suspend).toHaveBeenCalled();
    expect(keepAlive.pause).toHaveBeenCalled();

    hidden = false;
    ctx.resume.mockClear();
    listeners.visibilitychange();
    expect(ctx.resume).toHaveBeenCalled();
    expect(keepAlive.paused).toBe(false);
  });

  it("skips missed music steps after a pause instead of playing them all at once", () => {
    setUp({});
    const sound = new SoundBoard();
    sound.unlock();
    const ctx = FakeAudioContext.instances[0];
    const playStep = vi.spyOn(sound as any, "playStep");

    // A minute in the background: the clock jumped far past the next scheduled step.
    ctx.currentTime = 60;
    (sound as any).scheduleMusic();
    // Only the ~0.12 s lookahead gets scheduled (sixteenths at 132 BPM are ~0.11 s), not 60 s of notes.
    expect(playStep.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
