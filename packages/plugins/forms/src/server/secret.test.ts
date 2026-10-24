import type { AppContext } from "plumix/plugin";
import { createTestContext, createTestDb } from "plumix/test";
import { expect, test } from "vitest";

import { getOrCreateSecret, getSecret } from "./secret.js";

/**
 * `ctx` whose first settings write is preceded by another request's own first
 * mint: the moment between this request's read and its write.
 */
function racedBy(ctx: AppContext, other: () => Promise<unknown>): AppContext {
  let raced = false;
  const race = async () => {
    if (raced) return;
    raced = true;
    await other();
  };
  const settings: AppContext["settings"] = {
    write: async (...args) => {
      await race();
      return ctx.settings.write(...args);
    },
    writeIfAbsent: async (...args) => {
      await race();
      return ctx.settings.writeIfAbsent(...args);
    },
    removeValue: async (...args) => {
      await race();
      return ctx.settings.removeValue(...args);
    },
  };
  return { ...ctx, settings };
}

test("a first mint that loses a race answers the secret the winner stored", async () => {
  const db = await createTestDb();
  let winner: string | undefined;
  const ctx = racedBy(createTestContext({ db }), async () => {
    winner = await getOrCreateSecret(createTestContext({ db }), "bind_secret");
  });

  const loser = await getOrCreateSecret(ctx, "bind_secret");

  expect(loser).toBe(winner);
  expect(await getSecret(createTestContext({ db }), "bind_secret")).toBe(
    winner,
  );
});
