import type { ShipHistory } from "./ship-history.js";

export interface AccountGate {
  readonly wait: () => Promise<number>;
  readonly defer: (until: number, reason: string) => void;
}

export function accountGate(
  history: ShipHistory,
  clock: {
    readonly now: () => number;
    readonly pause: (ms: number) => Promise<void>;
  },
): AccountGate {
  return {
    wait: async () => {
      let waited = 0;
      for (;;) {
        const ms = history.cooldownUntil - clock.now();
        if (ms <= 0) return waited;
        await clock.pause(ms);
        waited += ms;
      }
    },
    defer: (until, reason) => {
      if (until > history.cooldownUntil)
        history.record({ type: "account.cooldown", until, reason });
    },
  };
}
