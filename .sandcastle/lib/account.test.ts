import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { accountGate } from "./account.js";
import { ShipHistory } from "./ship-history.js";

test("all lanes honour an account cooldown recovered from the journal", async () => {
  const root = mkdtempSync(join(tmpdir(), "ship-account-"));
  try {
    new ShipHistory(root).record({
      type: "account.cooldown",
      until: 5000,
      reason: "usage limit",
    });
    const history = new ShipHistory(root);
    let now = 1000;
    const pauses: number[] = [];
    const gate = accountGate(history, {
      now: () => now,
      pause: async (ms) => {
        pauses.push(ms);
        now += ms;
      },
    });
    await gate.wait();
    expect(pauses).toEqual([4000]);
    await gate.wait();
    expect(pauses).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true });
  }
});
