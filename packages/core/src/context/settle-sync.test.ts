import { describe, expect, test } from "vitest";

import type { ConnectedCdn } from "../runtime/contract/slots.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { sync } from "../events-and-filters/sync.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { settleSync } from "./settle-sync.js";

function cdnWith(purgeAll?: () => Promise<void>): ConnectedCdn {
  return {
    decorate: (response) => response,
    ...(purgeAll && { purgeAll }),
  };
}

async function contextWith(handlers: HandlerRegistry, cdn?: ConnectedCdn) {
  return createTestContext({ db: await createTestDb(), handlers, cdn });
}

describe("settleSync", () => {
  test("a throwing listener and a throwing purge are both reported, and every other step still runs", async () => {
    const handlers = new HandlerRegistry();
    const ran: string[] = [];
    handlers.on(
      sync.after,
      () => {
        throw new Error("index unreachable");
      },
      { plugin: "search" },
    );
    handlers.on(
      sync.after,
      () => {
        ran.push("og");
      },
      { plugin: "og" },
    );
    let purgeAttempted = false;
    const ctx = await contextWith(
      handlers,
      cdnWith(() => {
        purgeAttempted = true;
        return Promise.reject(new Error("zone refused"));
      }),
    );

    const report = await settleSync(ctx, {
      scopes: ["content"],
      direction: "push",
    });

    expect(ran).toEqual(["og"]);
    expect(purgeAttempted).toBe(true);
    expect(report).toEqual({
      cdn: "failed",
      failures: [
        { step: "plugin:search", message: "index unreachable" },
        { step: "cdn", message: "zone refused" },
      ],
    });
  });

  test("hands every listener the event and the context", async () => {
    const handlers = new HandlerRegistry();
    const events: unknown[] = [];
    handlers.on(sync.after, (event, appCtx) => {
      events.push([event, appCtx.origin]);
    });
    const ctx = await contextWith(handlers);

    await settleSync(ctx, { scopes: ["content", "media"], direction: "pull" });

    expect(events).toEqual([
      [{ scopes: ["content", "media"], direction: "pull" }, ctx.origin],
    ]);
  });

  test("a failing listener core registered is reported as the core step", async () => {
    const handlers = new HandlerRegistry();
    handlers.on(sync.after, () => Promise.reject(new Error("nope")));
    const ctx = await contextWith(handlers);

    const report = await settleSync(ctx, {
      scopes: ["content"],
      direction: "push",
    });

    expect(report.failures).toEqual([{ step: "core", message: "nope" }]);
  });

  test("purges everything on a cdn that can", async () => {
    let purged = 0;
    const ctx = await contextWith(
      new HandlerRegistry(),
      cdnWith(() => {
        purged += 1;
        return Promise.resolve();
      }),
    );

    const report = await settleSync(ctx, {
      scopes: ["content"],
      direction: "push",
    });

    expect(purged).toBe(1);
    expect(report).toEqual({ cdn: "purged", failures: [] });
  });

  test("reports a cdn that cannot purge everything without failing", async () => {
    const ctx = await contextWith(new HandlerRegistry(), cdnWith());

    const report = await settleSync(ctx, {
      scopes: ["content"],
      direction: "push",
    });

    expect(report).toEqual({ cdn: "cannot-purge", failures: [] });
  });

  test("reports no cdn on a site without one", async () => {
    const ctx = await contextWith(new HandlerRegistry());

    const report = await settleSync(ctx, {
      scopes: ["content"],
      direction: "push",
    });

    expect(report).toEqual({ cdn: "none", failures: [] });
  });
});
