import { describe, expect, test } from "vitest";

import type { Mailer } from "../auth/mailer/types.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createAppContext } from "./app.js";

const stubMailer = (): Mailer => ({ send: () => Promise.resolve() });

describe("createAppContext mailer resolution", () => {
  test("resolves a mailer resolver against the request env", async () => {
    const harness = await createDispatcherHarness({ env: { SECRET: "s" } });
    const mailer = stubMailer();
    const seenEnv: unknown[] = [];

    const ctx = createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request("https://cms.example/"),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      // The config slot now accepts an `(env) => Mailer` resolver; the context
      // must hand consumers the resolved transport, with the request env.
      mailer: (env) => {
        seenEnv.push(env);
        return mailer;
      },
    });

    expect(ctx.mailer).toBe(mailer);
    expect(seenEnv).toEqual([harness.env]);
  });

  test("passes a literal mailer through unchanged", async () => {
    const harness = await createDispatcherHarness();
    const mailer = stubMailer();

    const ctx = createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request("https://cms.example/"),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      mailer,
    });

    expect(ctx.mailer).toBe(mailer);
  });
});
