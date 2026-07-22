import { describe, expect, test } from "vitest";

import type { Mailer } from "../auth/mailer/types.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createAppContext } from "./app.js";

function captureMailer(): { mailer: Mailer; sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    mailer: { send: (m) => (sent.push(m.to), Promise.resolve()) },
  };
}

describe("createAppContext mailer resolution", () => {
  test("resolves a mailer resolver against the request env", async () => {
    const harness = await createDispatcherHarness({ env: { SECRET: "s" } });
    const { mailer, sent } = captureMailer();
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

    // Delegation, not identity — the context wraps the resolved transport in
    // the telemetry seam, so sends must reach the underlying mailer.
    await ctx.mailer?.send({ to: "u@example.com", subject: "s", text: "t" });
    expect(sent).toEqual(["u@example.com"]);
    expect(seenEnv).toEqual([harness.env]);
  });

  test("delegates to a literal mailer", async () => {
    const harness = await createDispatcherHarness();
    const { mailer, sent } = captureMailer();

    const ctx = createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request("https://cms.example/"),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      mailer,
    });

    await ctx.mailer?.send({ to: "u@example.com", subject: "s", text: "t" });
    expect(sent).toEqual(["u@example.com"]);
  });
});

describe("createAppContext platform I/O tracing", () => {
  test("assets, storage, cache, and mailer slots are wrapped in telemetry spans", async () => {
    const harness = await createDispatcherHarness();
    const ctx = createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request("https://cms.example/"),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      assets: { fetch: () => Promise.resolve(new Response("a")) },
      storage: {
        put: () => Promise.resolve(),
        get: () => Promise.resolve(null),
        head: () => Promise.resolve(null),
        delete: () => Promise.resolve(),
        list: () => Promise.resolve({ items: [], truncated: false }),
        url: () => Promise.resolve(null),
      },
      cache: {
        match: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
        purgeTags: () => Promise.resolve(),
      },
      mailer: { send: () => Promise.resolve() },
      // A consumer without `sample` always votes yes, activating the real
      // collector — the same seam production uses.
      telemetry: { consumers: [{ id: "in-test" }] },
    });

    await ctx.assets?.fetch(new Request("https://cms.example/x"));
    await ctx.storage?.get("k");
    await ctx.cache?.match(new Request("https://cms.example/"));
    await ctx.mailer?.send({ to: "u@example.com", subject: "s", text: "t" });

    expect(ctx.telemetry.getSpans().map((s) => s.name)).toEqual([
      "assets: fetch",
      "storage: get",
      "cache: match",
      "mailer: send",
    ]);
  });
});
