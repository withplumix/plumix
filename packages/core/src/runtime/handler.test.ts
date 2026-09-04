import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";
import type { Invocation, PlumixHandler } from "./adapter.js";
import type { PlumixHandlerOptions } from "./handler.js";
import type { DatabaseAdapter } from "./slots.js";
import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";
import { createPlumixHandler } from "./handler.js";
import { memoryKv } from "./memory-kv.js";
import { memoryStorage } from "./memory-storage.js";

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "cms.example", origin: "https://cms.example" },
});
const theme = defineTheme({ templates: [fallback(() => null)] });
const runtime = {
  name: "test",
  createHandler: createPlumixHandler,
  generateEntry: () => "",
};

async function handlerFor(
  overrides: Partial<Parameters<typeof plumix>[0]> = {},
  options: PlumixHandlerOptions = {},
) {
  const app = await buildApp(
    plumix({
      runtime,
      database: stubDatabase,
      auth: stubAuth,
      theme,
      ...overrides,
    }),
  );
  return createPlumixHandler(app, options);
}

const request = () => new Request("https://cms.example/unknown");

const echoClientAddress = definePlugin("echo", (ctx) => {
  ctx.registerPublicRoute({
    path: "/whoami",
    handler: (_request, appCtx) => new Response(appCtx.clientAddress ?? "none"),
  });
});

/** What a plugin route saw as the client address for this invocation. */
async function whoami(
  request: Request,
  invocation: Invocation,
): Promise<string> {
  const handler = await handlerFor({ plugins: [echoClientAddress] });
  return (await handler.fetch(request, invocation)).text();
}

/** A route that defers whatever promise the test hands it. */
const deferring = (work: (appCtx: AppContext) => Promise<unknown>) =>
  definePlugin("deferring", (ctx) => {
    ctx.registerPublicRoute({
      path: "/defer",
      handler: (_request, appCtx) => {
        appCtx.defer(work(appCtx));
        return new Response("deferred");
      },
    });
  });

/** A promise the test settles by hand, so drain timing is deterministic. */
function manualPromise() {
  let resolve!: (value: void) => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const after = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Whether `dispose()` finished draining inside `ms`. */
const drainedWithin = (handler: PlumixHandler, ms = 50) =>
  Promise.race([
    handler.dispose?.().then(() => true),
    after(ms).then(() => false),
  ]);

const deferRequest = () => new Request("https://cms.example/defer");

describe("createPlumixHandler — fetch", () => {
  test("routes a request through the dispatcher with a bare invocation", async () => {
    const handler = await handlerFor();
    const response = await handler.fetch(request(), { env: {} });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe(
      "public-route-not-found",
    );
  });

  test("a missing required binding is a readable 500 naming every missing key", async () => {
    const handler = await handlerFor({
      database: {
        kind: "bound",
        requiredBindings: ["DB", "CACHE"],
        connect: () => ({ db: {} }),
      },
    });
    const response = await handler.fetch(request(), { env: { OTHER: 1 } });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "bindings_missing",
      missing: ["DB", "CACHE"],
    });
  });

  test("binding validation is memoised per handler: the first env's verdict holds", async () => {
    const handler = await handlerFor({
      database: {
        kind: "bound",
        requiredBindings: ["DB"],
        connect: () => ({ db: {} }),
      },
    });
    const first = await handler.fetch(request(), { env: { DB: {} } });
    expect(first.status).toBe(404);
    // Without the memo this request would be the readable 500 above.
    const second = await handler.fetch(request(), { env: {} });
    expect(second.status).toBe(404);
  });

  test("a request-scoped database commits on the response path", async () => {
    const handler = await handlerFor({
      database: {
        kind: "scoped",
        connect: () => ({ db: {} }),
        connectRequest: () => ({
          db: {},
          commit: (response) => {
            const next = new Response(response.body, response);
            next.headers.set("x-commit-ran", "1");
            return next;
          },
        }),
      },
    });
    const response = await handler.fetch(request(), { env: {} });
    expect(response.headers.get("x-commit-ran")).toBe("1");
  });

  test("the invocation's client address reaches a handler as ctx.clientAddress", async () => {
    const seen = await whoami(new Request("https://cms.example/whoami"), {
      env: {},
      clientAddress: "203.0.113.7",
    });

    expect(seen).toBe("203.0.113.7");
  });

  test("an invocation with no client address leaves ctx.clientAddress undefined, whatever the request forwards", async () => {
    const seen = await whoami(
      new Request("https://cms.example/whoami", {
        headers: {
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "198.51.100.9",
        },
      }),
      { env: {} },
    );

    expect(seen).toBe("none");
  });

  test("an empty client address is an absent one, not a bucket of its own", async () => {
    const seen = await whoami(new Request("https://cms.example/whoami"), {
      env: {},
      clientAddress: "  ",
    });

    expect(seen).toBe("none");
  });

  test("deferred work rides waitUntil when the invocation supplies one", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const handler = await handlerFor({
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const waited: Promise<unknown>[] = [];
    const response = await handler.fetch(request(), {
      env: {},
      waitUntil: (promise) => void waited.push(promise),
    });
    expect(waited.length).toBeGreaterThan(0);
    await Promise.all(waited);
    expect(snapshots[0]?.request).toMatchObject({
      method: "GET",
      url: "https://cms.example/unknown",
      status: response.status,
    });
  });
});

describe("createPlumixHandler — scheduled", () => {
  test("runs the tasks whose cron matches the fired cron, and every task without one", async () => {
    const ran: string[] = [];
    const plugin = definePlugin("cron", (ctx) => {
      ctx.registerScheduledTask({
        id: "hourly",
        cron: "0 * * * *",
        handler: () => void ran.push("hourly"),
      });
      ctx.registerScheduledTask({
        id: "daily",
        cron: "0 0 * * *",
        handler: () => void ran.push("daily"),
      });
      ctx.registerScheduledTask({
        id: "always",
        handler: () => void ran.push("always"),
      });
    });
    const handler = await handlerFor({ plugins: [plugin] });
    await handler.scheduled?.(
      { scheduledTime: 0, cron: "0 0 * * *" },
      { env: {} },
    );
    expect(ran).toEqual(["daily", "always"]);
  });

  test("commits the scoped write a scheduled run makes", async () => {
    let committed = 0;
    const handler = await handlerFor({
      database: {
        kind: "scoped",
        connect: () => ({ db: {} }),
        connectRequest: () => ({
          db: {},
          commit: (response) => {
            committed += 1;
            return response;
          },
        }),
      },
    });
    await handler.scheduled?.(
      { scheduledTime: 0, cron: "* * * * *" },
      { env: {} },
    );
    expect(committed).toBe(1);
  });
});

describe("createPlumixHandler — slot binding", () => {
  test("storage, kv, cache and image delivery connect once across requests", async () => {
    const calls: string[] = [];
    const handler = await handlerFor({
      storage: {
        kind: "counting",
        connect: () => {
          calls.push("storage");
          return memoryStorage().connect();
        },
      },
      kv: {
        kind: "counting",
        connect: () => {
          calls.push("kv");
          return memoryKv().connect();
        },
      },
      cache: {
        kind: "counting",
        connect: () => {
          calls.push("cache");
          return null;
        },
      },
      imageDelivery: {
        kind: "counting",
        url: (source) => source,
        connect() {
          calls.push("imageDelivery");
          return this;
        },
      },
    });
    await handler.fetch(request(), { env: {} });
    await handler.fetch(request(), { env: {} });
    expect(calls.sort()).toEqual(["cache", "imageDelivery", "kv", "storage"]);
  });

  test("a database without connectRequest connects once across requests", async () => {
    let connects = 0;
    const handler = await handlerFor({
      database: {
        kind: "counting",
        connect: () => {
          connects += 1;
          return { db: {} };
        },
      },
    });
    await handler.fetch(request(), { env: {} });
    await handler.fetch(request(), { env: {} });
    expect(connects).toBe(1);
  });

  test("a database with connectRequest still runs it per request", async () => {
    let scoped = 0;
    const handler = await handlerFor({
      database: {
        kind: "counting",
        connect: () => ({ db: {} }),
        connectRequest: () => {
          scoped += 1;
          return { db: {}, commit: (response) => response };
        },
      },
    });
    await handler.fetch(request(), { env: {} });
    await handler.fetch(request(), { env: {} });
    expect(scoped).toBe(2);
  });

  test("connectRequest returning null falls through to a once-bound connect", async () => {
    let connects = 0;
    const handler = await handlerFor({
      database: {
        kind: "counting",
        connect: () => {
          connects += 1;
          return { db: {} };
        },
        connectRequest: () => null,
      },
    });
    await handler.fetch(request(), { env: {} });
    await handler.fetch(request(), { env: {} });
    expect(connects).toBe(1);
  });
});

describe("createPlumixHandler — deferred work", () => {
  test("without waitUntil, dispose() resolves only after deferred work settles", async () => {
    const gate = manualPromise();
    const handler = await handlerFor({
      plugins: [deferring(() => gate.promise)],
    });
    await handler.fetch(deferRequest(), { env: {} });

    expect(await drainedWithin(handler)).toBe(false);
    gate.resolve();
    expect(await drainedWithin(handler)).toBe(true);
  });

  test("with waitUntil, the promise rides it and dispose() has nothing to wait for", async () => {
    const gate = manualPromise();
    const handler = await handlerFor({
      plugins: [deferring(() => gate.promise)],
    });
    const waited: Promise<unknown>[] = [];
    await handler.fetch(deferRequest(), {
      env: {},
      waitUntil: (promise) => void waited.push(promise),
    });

    expect(waited).toHaveLength(1);
    // The gate never settles: a tracked promise would hold dispose() open.
    expect(await drainedWithin(handler)).toBe(true);
  });

  test("dispose() follows work that deferred work defers in turn", async () => {
    const ran: string[] = [];
    const outer = manualPromise();
    const handler = await handlerFor({
      plugins: [
        deferring((appCtx) =>
          outer.promise.then(() => {
            ran.push("outer");
            // The nested task takes a timer to settle, so a drain that only
            // awaits its opening snapshot returns with it still unfinished.
            appCtx.defer(after(20).then(() => void ran.push("inner")));
          }),
        ),
      ],
    });
    await handler.fetch(deferRequest(), { env: {} });

    const drain = handler.dispose?.();
    outer.resolve();
    await drain;

    expect(ran).toEqual(["outer", "inner"]);
  });

  test("dispose() gives up at its timeout and says how much work it abandoned", async () => {
    const stuck = manualPromise();
    const handler = await handlerFor(
      { plugins: [deferring(() => stuck.promise)] },
      { disposeTimeoutMs: 10 },
    );
    await handler.fetch(deferRequest(), { env: {} });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      expect(await handler.dispose?.()).toEqual({ abandoned: 1 });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("deferred_work_abandoned: 1 deferred task(s)"),
      );
    } finally {
      warn.mockRestore();
      stuck.resolve();
    }
  });

  test("a per-call deadline overrides the handler's, so a shutdown can spend what it has left", async () => {
    const stuck = manualPromise();
    const handler = await handlerFor(
      { plugins: [deferring(() => stuck.promise)] },
      { disposeTimeoutMs: 60_000 },
    );
    await handler.fetch(deferRequest(), { env: {} });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const began = Date.now();
      expect(await handler.dispose?.({ timeoutMs: 10 })).toEqual({
        abandoned: 1,
      });
      expect(Date.now() - began).toBeLessThan(1_000);
    } finally {
      warn.mockRestore();
      stuck.resolve();
    }
  });

  test("what dispose() gave up on is not waited for a second time", async () => {
    const stuck = manualPromise();
    const handler = await handlerFor(
      { plugins: [deferring(() => stuck.promise)] },
      { disposeTimeoutMs: 20 },
    );
    await handler.fetch(deferRequest(), { env: {} });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await handler.dispose?.();
      // A supervisor escalating SIGTERM to SIGINT must not buy the abandoned
      // task another full timeout.
      expect(await drainedWithin(handler, 10)).toBe(true);
    } finally {
      warn.mockRestore();
      stuck.resolve();
    }
  });

  test("a rejected deferred task reaches the logger and never the process, in either mode", async () => {
    // The handler leaves `ctx.logger` at its console default, so the sink the
    // spy watches is the one an operator's logger would replace.
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const trap = (reason: unknown): void => void unhandled.push(reason);
    process.on("unhandledRejection", trap);

    try {
      const handler = await handlerFor({
        plugins: [deferring(() => Promise.reject(new Error("purge-failed")))],
      });
      await handler.fetch(deferRequest(), { env: {} });
      await handler.dispose?.();

      const waited: Promise<unknown>[] = [];
      await handler.fetch(deferRequest(), {
        env: {},
        waitUntil: (promise) => void waited.push(promise),
      });
      await Promise.all(waited);
      // A macrotask turn: an unhandled rejection is reported at the end of one.
      await after(10);

      const logged = error.mock.calls.filter((args) =>
        args.some((arg) => String(arg).includes("purge-failed")),
      );
      expect(logged).toHaveLength(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", trap);
      error.mockRestore();
    }
  });
});
