// PROTOTYPE — throwaway. A virtual clock so a 24-hour simulation runs instantly
// while the scheduler's real async control flow is exercised unchanged.
export function createVirtualClock(startIso) {
  let now = Date.parse(startIso);
  let seq = 0;
  const sleepers = [];
  return {
    now: () => now,
    sleep(ms) {
      return new Promise((resolve) => {
        sleepers.push({ at: now + ms, seq: seq++, resolve });
      });
    },
    /** Advance until `untilIso`, resolving sleepers in order. */
    async runUntil(untilIso) {
      const end = Date.parse(untilIso);
      for (;;) {
        sleepers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = sleepers[0];
        if (!next || next.at > end) break;
        sleepers.shift();
        now = Math.max(now, next.at);
        next.resolve();
        // Let everything the wake-up unblocked settle before the next jump.
        for (let i = 0; i < 50; i++) await Promise.resolve();
      }
      now = end;
    },
  };
}
