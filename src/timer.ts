/** Wall-clock stopwatch. `now` is injectable for tests. */
export class Stopwatch {
  private startedAt: number;
  private stoppedAt: number | null = null;

  constructor(private now: () => number = () => performance.now()) {
    this.startedAt = now();
  }

  elapsedMs(): number {
    return (this.stoppedAt ?? this.now()) - this.startedAt;
  }

  stop(): void {
    this.stoppedAt ??= this.now();
  }
}

export function totalMs(elapsedMs: number, penaltyMinutes: number): number {
  return elapsedMs + penaltyMinutes * 60_000;
}

/** mm:ss, growing to h:mm:ss past an hour. */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
