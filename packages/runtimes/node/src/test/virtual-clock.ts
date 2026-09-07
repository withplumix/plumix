import type { SchedulerClock } from "../scheduler.js";

/**
 * A clock whose sleeps are jumps, so a simulated day costs no wall time and no
 * test flakes on a slow machine. `advanceTo` resolves sleepers in due order.
 */
export function virtualClock(startIso: string) {
  let now = Date.parse(startIso);
  let seq = 0;
  const sleepers: { at: number; seq: number; wake: () => void }[] = [];
  const clock: SchedulerClock & {
    advanceTo: (iso: string) => Promise<void>;
    suspend: (ms: number) => void;
  } = {
    now: () => now,
    sleep: (ms) =>
      new Promise<void>((wake) => {
        sleepers.push({ at: now + ms, seq: seq++, wake });
      }),
    /** Time passes with nothing running — a slept laptop, a paused container. */
    suspend(ms) {
      now += ms;
    },
    async advanceTo(iso) {
      const end = Date.parse(iso);
      // Bounded so a scheduler that never advances fails loudly instead of
      // hanging until the test timeout.
      for (let step = 0; step < 100_000; step++) {
        sleepers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = sleepers.shift();
        if (!next || next.at > end) {
          if (next) sleepers.unshift(next);
          break;
        }
        now = Math.max(now, next.at);
        next.wake();
        for (let i = 0; i < 50; i++) await Promise.resolve();
      }
      now = Math.max(now, end);
    },
  };
  return clock;
}
