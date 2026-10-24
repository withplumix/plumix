import {
  describe,
  expect,
  expectTypeOf,
  onTestFinished,
  test,
  vi,
} from "vitest";

import type { AppContext } from "../context/app-context.js";
import type {
  Invocation,
  PlumixHandler,
  RuntimeHandlerSpec,
  ScheduledRunReport,
} from "../context/runtime-adapter.js";
import type { TelemetrySnapshot, TelemetrySpan } from "../context/telemetry.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { DatabaseAdapter } from "./contract/slots.js";
import type { PlumixHandlerOptions } from "./handler.js";
import { auth } from "../auth/config.js";
import { enqueuePurgeTags } from "../cdn/purge.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";
import { plumix } from "./define-config.js";
import { createPlumixHandler, createRuntimeHandler } from "./handler.js";
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
  handler: {},
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

const echoClientAddress = definePlugin("echo", {
  setup: (ctx) => {
    ctx.registerPublicRoute({
      path: "/whoami",
      handler: (_request, appCtx) =>
        new Response(appCtx.clientAddress ?? "none"),
    });
  },
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
  definePlugin("deferring", {
    setup: (ctx) => {
      ctx.registerPublicRoute({
        path: "/defer",
        handler: (_request, appCtx) => {
          appCtx.defer(work(appCtx));
          return new Response("deferred");
        },
      });
    },
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

/** A route that logs one line through `ctx.logger`. */
const logging = definePlugin("logging", {
  setup: (ctx) => {
    ctx.registerPublicRoute({
      path: "/log",
      handler: (_request, appCtx) => {
        appCtx.logger.info("route_hit", { path: "/log" });
        return new Response("logged");
      },
    });
  },
});

const spyLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

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
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => error.mockRestore());
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
    expect(error).toHaveBeenCalledWith(
      "[plumix] handler_failure",
      expect.objectContaining({ code: "bindings_missing" }),
    );
  });

  test("a request that fails goes to the logger the runtime hands the handler, not the console", async () => {
    const consoleError = vi.spyOn(console, "error");
    onTestFinished(() => consoleError.mockRestore());
    const logger = spyLogger();
    const handler = await handlerFor(
      {
        database: {
          kind: "bound",
          requiredBindings: ["DB"],
          connect: () => ({ db: {} }),
        },
      },
      { logger },
    );

    const response = await handler.fetch(request(), { env: {} });

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("[plumix] handler_failure", {
      error: expect.objectContaining({ code: "bindings_missing" }) as unknown,
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  test("a logger that throws while reporting a failed request still lets the 500 through", async () => {
    const logger = spyLogger();
    logger.error.mockImplementation(() => {
      throw new Error("EPIPE");
    });
    const handler = await handlerFor(
      {
        database: {
          kind: "bound",
          requiredBindings: ["DB"],
          connect: () => ({ db: {} }),
        },
      },
      { logger },
    );

    const response = await handler.fetch(request(), { env: {} });

    expect(response.status).toBe(500);
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

  test("isAuthenticated reflects a custom authenticator's hasSession verdict, not the session cookie", async () => {
    let seenIsAuthenticated: boolean | undefined;
    const handler = await handlerFor({
      database: {
        kind: "scoped",
        connect: () => ({ db: {} }),
        connectRequest: (args) => {
          seenIsAuthenticated = args.isAuthenticated;
          return { db: {}, commit: (response) => response };
        },
      },
      auth: auth({
        passkey: stubAuth.passkey,
        authenticator: {
          authenticate: () => Promise.resolve(null),
          hasSession: (r) => r.headers.get("x-sso") === "1",
        },
      }),
    });

    await handler.fetch(
      new Request("https://cms.example/unknown", {
        headers: { "x-sso": "1" },
      }),
      { env: {} },
    );
    expect(seenIsAuthenticated).toBe(true);

    await handler.fetch(request(), { env: {} });
    expect(seenIsAuthenticated).toBe(false);
  });

  test("a bearer-only request is still classified unauthenticated", async () => {
    let seenIsAuthenticated: boolean | undefined;
    const handler = await handlerFor({
      database: {
        kind: "scoped",
        connect: () => ({ db: {} }),
        connectRequest: (args) => {
          seenIsAuthenticated = args.isAuthenticated;
          return { db: {}, commit: (response) => response };
        },
      },
      auth: auth({
        passkey: stubAuth.passkey,
        authenticator: {
          authenticate: () => Promise.resolve(null),
          hasSession: () => false,
        },
      }),
    });

    await handler.fetch(
      new Request("https://cms.example/unknown", {
        headers: { Authorization: "Bearer token" },
      }),
      { env: {} },
    );
    expect(seenIsAuthenticated).toBe(false);
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

  test("a logger the runtime hands the handler is the one a request logs through", async () => {
    const logger = spyLogger();
    const handler = await handlerFor({ plugins: [logging] }, { logger });

    await handler.fetch(new Request("https://cms.example/log"), { env: {} });

    expect(logger.info).toHaveBeenCalledWith("route_hit", {
      path: "/log",
      requestId: expect.any(String) as unknown,
    });
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
    const plugin = definePlugin("cron", {
      setup: (ctx) => {
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
      },
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

  test("a task's ctx.signal follows the invocation's signal", async () => {
    const shutdown = new AbortController();
    let signal: AbortSignal | undefined;
    const plugin = definePlugin("cron", {
      setup: (ctx) => {
        ctx.registerScheduledTask({
          id: "watches",
          handler: (taskCtx) => {
            signal = taskCtx.signal;
          },
        });
      },
    });
    const handler = await handlerFor({ plugins: [plugin] });

    await handler.scheduled?.(
      { scheduledTime: 0, cron: "* * * * *" },
      { env: {}, signal: shutdown.signal },
    );
    shutdown.abort("shutdown");

    expect(signal?.reason).toBe("shutdown");
  });
});

describe("createPlumixHandler — run", () => {
  test("hands the work the site's context and returns what it did", async () => {
    const notes = definePlugin("notes", {
      setup: (ctx) => {
        ctx.registerEntryType("note", { label: "Notes" });
      },
    });
    const handler = await handlerFor({ plugins: [notes] });
    const result = await handler.run?.(
      (ctx) => Promise.resolve(ctx.plugins.entryTypes.has("note")),
      { env: {} },
    );
    expect(result).toBe(true);
  });

  test("the work's ctx.signal never aborts, even past a scheduled task's budget", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const handler = await handlerFor({});

    const signal = await handler.run?.(
      async (ctx) => {
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        return ctx.signal;
      },
      { env: {} },
    );

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  test("commits the scoped write the work makes", async () => {
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
    await handler.run?.(() => Promise.resolve(), { env: {} });
    expect(committed).toBe(1);
  });

  test("purges what the work enqueued, as the end of a request would", async () => {
    const purged: string[] = [];
    const handler = await handlerFor({
      cdn: {
        kind: "recording",
        connect: () => ({
          decorate: (response) => response,
          purgeTags: (tags) => {
            purged.push(...tags);
            return Promise.resolve();
          },
        }),
      },
    });
    await handler.run?.(
      (ctx) => {
        enqueuePurgeTags(ctx, ["t:post"]);
        return Promise.resolve();
      },
      { env: {} },
    );
    await handler.dispose?.();
    expect(purged).toEqual(["t:post"]);
  });
});

// Rows the work wrote before it threw are written: their pages still need
// purging, exactly as a request that fails after a write purges it.
describe("createPlumixHandler — run, failing", () => {
  test("still purges what the work enqueued before it threw, and rethrows", async () => {
    const purged: string[] = [];
    const handler = await handlerFor({
      cdn: {
        kind: "recording",
        connect: () => ({
          decorate: (response) => response,
          purgeTags: (tags) => {
            purged.push(...tags);
            return Promise.resolve();
          },
        }),
      },
    });

    const outcome = await handler
      .run?.(
        (ctx) => {
          enqueuePurgeTags(ctx, ["e:7"]);
          return Promise.reject(new Error("halfway"));
        },
        { env: {} },
      )
      .then(
        () => "resolved",
        (error: unknown) => (error instanceof Error ? error.message : "?"),
      );
    await handler.dispose?.();

    expect(outcome).toBe("halfway");
    expect(purged).toEqual(["e:7"]);
  });
});

describe("createPlumixHandler — slot binding", () => {
  test("storage, kv, cdn and image delivery connect once across requests", async () => {
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
      cdn: {
        kind: "counting",
        connect: () => {
          calls.push("cdn");
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
    expect(calls.sort()).toEqual(["cdn", "imageDelivery", "kv", "storage"]);
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

  test("abandoned work is reported to the logger the runtime hands the handler", async () => {
    const stuck = manualPromise();
    onTestFinished(() => stuck.resolve());
    const consoleWarn = vi.spyOn(console, "warn");
    onTestFinished(() => consoleWarn.mockRestore());
    const logger = spyLogger();
    const handler = await handlerFor(
      { plugins: [deferring(() => stuck.promise)] },
      { disposeTimeoutMs: 10, logger },
    );
    await handler.fetch(deferRequest(), { env: {} });

    await handler.dispose?.();

    expect(logger.warn).toHaveBeenCalledWith(
      "[plumix] deferred_work_abandoned: 1 deferred task(s) still running after 10ms",
      undefined,
    );
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test("a database that fails to close is reported to the logger the runtime hands the handler", async () => {
    const consoleWarn = vi.spyOn(console, "warn");
    onTestFinished(() => consoleWarn.mockRestore());
    const logger = spyLogger();
    const closeFailed = new Error("busy");
    const handler = await handlerFor(
      {
        database: {
          kind: "closing",
          connect: () => ({
            db: {},
            close: () => {
              throw closeFailed;
            },
          }),
        },
      },
      { logger },
    );
    await handler.fetch(request(), { env: {} });

    await handler.dispose?.();

    expect(logger.warn).toHaveBeenCalledWith("[plumix] database_close_failed", {
      error: closeFailed,
    });
    expect(consoleWarn).not.toHaveBeenCalled();
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

/**
 * A schedule none of core's own tasks declare, so a firing on it runs only the
 * untagged tasks a test registers — those run on every firing.
 */
const UNCLAIMED_CRON = "0 9 * * MON";

const oneTask = definePlugin("reports", {
  setup: (ctx) => {
    ctx.registerScheduledTask({ id: "ok", handler: () => undefined });
  },
});

/** A database whose per-request seam is whatever the test needs to fail. */
const scopedDatabase = (
  connectRequest: DatabaseAdapter["connectRequest"],
): DatabaseAdapter => ({ ...stubDatabase, connectRequest });

describe("createPlumixHandler — scheduled reporting", () => {
  test("returns what the run did, so a caller outside can act on it", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => error.mockRestore());
    // The report survives the handler's own path — cron routing, the commit,
    // the return — not just `runScheduledTasks`, which is covered on its own.
    const oneTaskOneFailure = definePlugin("reports", {
      setup: (ctx) => {
        ctx.registerScheduledTask({ id: "ok", handler: () => undefined });
        ctx.registerScheduledTask({
          id: "boom",
          handler: () => {
            throw new Error("nope");
          },
        });
      },
    });
    const handler = await handlerFor({ plugins: [oneTaskOneFailure] });

    const report = await handler.scheduled?.(
      { scheduledTime: 0, cron: UNCLAIMED_CRON },
      { env: {} },
    );

    expect(report).toStrictEqual({
      ran: 1,
      failed: ["reports:boom"],
      timedOut: [],
    });
    expect(error).toHaveBeenCalledWith(
      `[plumix] scheduled task "reports:boom" failed: nope`,
      expect.objectContaining({ taskId: "boom", plugin: "reports" }),
    );
  });

  test("keeps the tasks it ran when the commit after them throws", async () => {
    // The commit's response has no reader, and a throw there hasn't stopped
    // the run reaching its tasks, so it isn't `aborted`.
    const handler = await handlerFor({
      plugins: [oneTask],
      database: scopedDatabase(() => ({
        db: {},
        commit: () => {
          throw new Error("commit failed");
        },
      })),
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const report = await handler.scheduled?.(
        { scheduledTime: 0, cron: UNCLAIMED_CRON },
        { env: {} },
      );

      expect(report).toStrictEqual({ ran: 1, failed: [], timedOut: [] });
      // Kept out of the report, so the log is the only place it surfaces.
      const logged = error.mock.calls.filter((args) =>
        args.some((arg) => String(arg).includes("commit failed")),
      );
      expect(logged).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
  });

  test("reports aborted when setup throws before the tasks run", async () => {
    // The same slot, failing at the other end: a connection the run never got
    // means the tasks never ran, which is what `aborted` exists to say.
    const handler = await handlerFor({
      plugins: [oneTask],
      database: scopedDatabase(() => {
        throw new Error("no connection");
      }),
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const report = await handler.scheduled?.(
        { scheduledTime: 0, cron: UNCLAIMED_CRON },
        { env: {} },
      );

      expect(report).toStrictEqual({
        ran: 0,
        failed: [],
        aborted: "no connection",
      });
    } finally {
      error.mockRestore();
    }
  });

  test("reports a task that outran its budget as timed out, and runs the next", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const logger = spyLogger();
    const hangsThenOk = definePlugin("reports", {
      setup: (ctx) => {
        ctx.registerScheduledTask({
          id: "stuck",
          timeoutMs: 1_000,
          handler: () => new Promise<void>(() => undefined),
        });
        ctx.registerScheduledTask({ id: "ok", handler: () => undefined });
      },
    });
    const handler = await handlerFor({ plugins: [hangsThenOk] }, { logger });

    const run = handler.scheduled?.(
      { scheduledTime: 0, cron: UNCLAIMED_CRON },
      { env: {} },
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(run).resolves.toStrictEqual({
      ran: 1,
      failed: [],
      timedOut: ["reports:stuck"],
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("a run that never started goes to the logger the runtime hands the handler", async () => {
    const consoleError = vi.spyOn(console, "error");
    onTestFinished(() => consoleError.mockRestore());
    const logger = spyLogger();
    const handler = await handlerFor(
      {
        plugins: [oneTask],
        database: scopedDatabase(() => {
          throw new Error("no connection");
        }),
      },
      { logger },
    );

    await handler.scheduled?.(
      { scheduledTime: 0, cron: UNCLAIMED_CRON },
      { env: {} },
    );

    expect(logger.error).toHaveBeenCalledWith("[plumix] scheduled_failure", {
      error: expect.objectContaining({ message: "no connection" }) as unknown,
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  test("keeps the tasks it ran when the commit throws and logging it throws too", async () => {
    // The guard around the commit reports through the same logger that may be
    // the thing failing, so it cannot assume its own report lands.
    const handler = await handlerFor({
      plugins: [oneTask],
      database: scopedDatabase(() => ({
        db: {},
        commit: () => {
          throw new Error("commit failed");
        },
      })),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("transport down");
    });

    try {
      const report = await handler.scheduled?.(
        { scheduledTime: 0, cron: UNCLAIMED_CRON },
        { env: {} },
      );
      expect(report).toStrictEqual({ ran: 1, failed: [], timedOut: [] });
    } finally {
      error.mockRestore();
    }
  });

  test("the report type only admits an abort from before any task ran", () => {
    // Third-party adapters write their own reports, so the type holds the
    // invariant. `expectTypeOf` compiles away; `pnpm typecheck` runs these.
    expectTypeOf<{
      readonly ran: 1;
      readonly failed: readonly [];
      readonly aborted: string;
    }>().not.toExtend<ScheduledRunReport>();

    expectTypeOf<{
      readonly ran: 0;
      readonly failed: readonly [];
      readonly aborted: string;
    }>().toExtend<ScheduledRunReport>();

    // Nothing ran, so there is nothing to have failed either.
    expectTypeOf<{
      readonly ran: 0;
      readonly failed: readonly string[];
      readonly aborted: string;
    }>().not.toExtend<ScheduledRunReport>();

    expectTypeOf<{
      readonly ran: 2;
      readonly failed: readonly string[];
      readonly timedOut: readonly string[];
    }>().toExtend<ScheduledRunReport>();
  });
});

describe("createPlumixHandler — releasing the database", () => {
  test("closes the connection it bound, once dispose has drained", async () => {
    const close = vi.fn();
    const handler = await handlerFor({
      database: {
        kind: "closable",
        connect: () => ({ db: {}, close }),
      },
    });

    await handler.fetch(request(), { env: {} });
    expect(close).not.toHaveBeenCalled();

    await handler.dispose?.();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("says nothing when the adapter has no connection to release", async () => {
    // D1 is a binding; there is nothing to close, and dispose must not care.
    const handler = await handlerFor({
      database: { kind: "binding", connect: () => ({ db: {} }) },
    });

    await handler.fetch(request(), { env: {} });
    await expect(handler.dispose?.()).resolves.toEqual({ abandoned: 0 });
  });

  test("is not terminal: a fetch after dispose reconnects rather than failing", async () => {
    let connects = 0;
    const close = vi.fn();
    const handler = await handlerFor({
      database: {
        kind: "closable",
        connect: () => {
          connects += 1;
          return { db: {}, close };
        },
      },
    });

    await handler.fetch(request(), { env: {} });
    await handler.dispose?.();
    expect(connects).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);

    const response = await handler.fetch(request(), { env: {} });
    expect(response.status).not.toBe(500);
    expect(connects).toBe(2);

    await handler.dispose?.();
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe("createRuntimeHandler", () => {
  async function appWith(
    handler: RuntimeHandlerSpec,
    plugins: Parameters<typeof plumix>[0]["plugins"] = [],
  ) {
    return buildApp(
      plumix({
        runtime: { ...runtime, handler },
        database: stubDatabase,
        auth: stubAuth,
        theme,
        plugins,
      }),
    );
  }

  test("runs prepare once per handler, with the app's hooks, before the first request", async () => {
    const events: string[] = [];
    const prepared: HookRegistry[] = [];
    const marking = definePlugin("marking", {
      setup: (ctx) => {
        ctx.registerPublicRoute({
          path: "/mark",
          handler: () => {
            events.push("request");
            return new Response("ok");
          },
        });
      },
    });
    const app = await appWith(
      {
        prepare: (hooks) => {
          events.push("prepare");
          prepared.push(hooks);
        },
      },
      [marking],
    );

    const handler = createRuntimeHandler(app);
    await handler.fetch(new Request("https://cms.example/mark"), { env: {} });
    await handler.fetch(new Request("https://cms.example/mark"), { env: {} });

    expect(events).toEqual(["prepare", "request", "request"]);
    expect(prepared).toEqual([app.hooks]);
  });

  test("the runtime's client address reaches the invocation, over the caller's", async () => {
    const app = await appWith(
      {
        clientAddress: (request) =>
          request.headers.get("x-edge-ip") ?? undefined,
      },
      [echoClientAddress],
    );
    const handler = createRuntimeHandler(app);

    const response = await handler.fetch(
      new Request("https://cms.example/whoami", {
        headers: { "x-edge-ip": "203.0.113.7" },
      }),
      { env: {}, clientAddress: "198.51.100.9" },
    );

    expect(await response.text()).toBe("203.0.113.7");
  });

  test("the logger the entry hands it is the one a request logs through", async () => {
    const app = await appWith({}, [logging]);
    const logger = spyLogger();
    const handler = createRuntimeHandler(app, { logger });

    await handler.fetch(new Request("https://cms.example/log"), { env: {} });

    expect(logger.info).toHaveBeenCalledWith("route_hit", {
      path: "/log",
      requestId: expect.any(String) as unknown,
    });
  });
});

/** A route that runs whatever the test hands it with the request's context. */
const working = (work: (appCtx: AppContext) => unknown) =>
  definePlugin("working", {
    setup: (ctx) => {
      ctx.registerPublicRoute({
        path: "/work",
        handler: async (_request, appCtx) => {
          await work(appCtx);
          return new Response("worked");
        },
      });
    },
  });

/** The snapshot a test consumer receives for one request to `working(work)`. */
async function snapshotOfWork(
  work: (appCtx: AppContext) => unknown,
  logger = spyLogger(),
  sample?: () => boolean,
): Promise<TelemetrySnapshot | undefined> {
  const snapshots: TelemetrySnapshot[] = [];
  const handler = await handlerFor(
    {
      plugins: [working(work)],
      telemetry: {
        consumers: [
          {
            id: "in-test",
            sample,
            onRequestEnd: (s) => void snapshots.push(s),
          },
        ],
      },
    },
    { logger },
  );
  const waited: Promise<unknown>[] = [];
  await handler.fetch(new Request("https://cms.example/work"), {
    env: {},
    waitUntil: (promise) => void waited.push(promise),
  });
  await Promise.all(waited);
  return snapshots[0];
}

function findSpan(
  spans: readonly TelemetrySpan[],
  name: string,
): TelemetrySpan | undefined {
  for (const span of spans) {
    if (span.name === name) return span;
    const nested = findSpan(span.children, name);
    if (nested) return nested;
  }
  return undefined;
}

describe("createPlumixHandler — span logs", () => {
  test("a log written inside a span is kept on that span with its level, message, time and meta", async () => {
    const before = Date.now();
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", () => {
        appCtx.logger.warn("skipped item without a slug", { guid: "g-1" });
      }),
    );

    const logs = findSpan(snapshot?.spans ?? [], "x")?.logs ?? [];
    expect(logs).toEqual([
      {
        at: expect.any(Number) as unknown,
        level: "warn",
        message: "skipped item without a slug",
        attributes: expect.objectContaining({ guid: "g-1" }) as unknown,
      },
    ]);
    expect(logs[0]?.at).toBeGreaterThanOrEqual(before);
    expect(logs[0]?.at).toBeLessThanOrEqual(Date.now());
  });

  test("an Error in a log's meta is kept in a span error's shape", async () => {
    const error = new TypeError("bad feed");
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", () => {
        appCtx.logger.error("import failed", { error });
      }),
    );

    expect(findSpan(snapshot?.spans ?? [], "x")?.logs[0]?.attributes).toEqual(
      expect.objectContaining({
        error: { name: "TypeError", message: "bad feed", stack: error.stack },
      }),
    );
  });

  test("logs at every level are kept", async () => {
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", () => {
        appCtx.logger.debug("d");
        appCtx.logger.info("i");
        appCtx.logger.warn("w");
        appCtx.logger.error("e");
      }),
    );

    const logs = findSpan(snapshot?.spans ?? [], "x")?.logs ?? [];
    expect(logs.map(({ level, message }) => [level, message])).toEqual([
      ["debug", "d"],
      ["info", "i"],
      ["warn", "w"],
      ["error", "e"],
    ]);
  });

  test("an unsampled request keeps no log, and the logger still gets every call", async () => {
    const logger = spyLogger();
    let spans: readonly TelemetrySpan[] | undefined;
    const snapshot = await snapshotOfWork(
      (appCtx) =>
        appCtx.telemetry.span("x", () => {
          appCtx.logger.debug("d");
          appCtx.logger.info("i");
          appCtx.logger.warn("w");
          appCtx.logger.error("e");
          spans = appCtx.telemetry.getSpans();
        }),
      logger,
      () => false,
    );

    expect(snapshot).toBeUndefined();
    expect(spans).toEqual([]);
    for (const [level, message] of [
      ["debug", "d"],
      ["info", "i"],
      ["warn", "w"],
      ["error", "e"],
    ] as const) {
      expect(logger[level]).toHaveBeenCalledExactlyOnceWith(
        message,
        expect.anything(),
      );
    }
  });

  test("a log written with no span current reaches the logger and is kept on no span", async () => {
    // A failed task is logged after its span has ended, with none current.
    const logger = spyLogger();
    const snapshots: TelemetrySnapshot[] = [];
    const failing = definePlugin("reports", {
      setup: (ctx) => {
        ctx.registerScheduledTask({
          id: "boom",
          handler: () => {
            throw new Error("nope");
          },
        });
      },
    });
    const handler = await handlerFor(
      {
        plugins: [failing],
        telemetry: {
          consumers: [
            { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
          ],
        },
      },
      { logger },
    );
    const waited: Promise<unknown>[] = [];
    await handler.scheduled?.(
      { scheduledTime: 0, cron: UNCLAIMED_CRON },
      { env: {}, waitUntil: (promise) => void waited.push(promise) },
    );
    await Promise.all(waited);

    expect(logger.error).toHaveBeenCalledWith(
      `[plumix] scheduled task "reports:boom" failed: nope`,
      expect.anything(),
    );
    const logs: unknown[] = [];
    const collect = (spans: readonly TelemetrySpan[]): void => {
      for (const span of spans) {
        logs.push(...span.logs);
        collect(span.children);
      }
    };
    collect(snapshots[0]?.spans ?? []);
    expect(findSpan(snapshots[0]?.spans ?? [], "cron: boom")).toBeDefined();
    expect(logs).toEqual([]);
  });

  test("core's own log lines are kept on the current span", async () => {
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", async () => {
        appCtx.defer(Promise.reject(new Error("purge failed")));
        await Promise.resolve();
      }),
    );

    // The rejection is logged inside the `defer` span the call opened.
    expect(findSpan(snapshot?.spans ?? [], "defer")?.logs).toEqual([
      expect.objectContaining({
        level: "error",
        message: "[plumix] deferred promise rejected: purge failed",
      }),
    ]);
  });

  test("every call the logger gets carries the request's requestId", async () => {
    const logger = spyLogger();
    const snapshot = await snapshotOfWork((appCtx) => {
      appCtx.logger.info("no meta");
      appCtx.logger.warn("with meta", { guid: "g-1" });
    }, logger);

    const requestId = snapshot?.request.requestId;
    expect(requestId).toEqual(expect.any(String));
    expect(logger.info).toHaveBeenCalledWith("no meta", { requestId });
    expect(logger.warn).toHaveBeenCalledWith("with meta", {
      guid: "g-1",
      requestId,
    });
  });

  test("a requestId the caller passes is kept", async () => {
    const logger = spyLogger();
    await snapshotOfWork((appCtx) => {
      appCtx.logger.info("relayed", { requestId: "upstream-1" });
    }, logger);

    expect(logger.info).toHaveBeenCalledWith("relayed", {
      requestId: "upstream-1",
    });
  });

  test("a request keeps its first 1000 logs and counts the rest as dropped", async () => {
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", () => {
        for (let i = 1; i <= 1001; i++) appCtx.logger.debug(`line ${i}`);
      }),
    );

    const logs = findSpan(snapshot?.spans ?? [], "x")?.logs ?? [];
    expect(logs).toHaveLength(1000);
    expect(logs.at(-1)?.message).toBe("line 1000");
    expect(snapshot?.dropped.logs).toBe(1);
  });

  test("a log whose meta JSON cannot hold is kept with why, and the call does not throw", async () => {
    const logger = spyLogger();
    const snapshot = await snapshotOfWork(
      (appCtx) =>
        appCtx.telemetry.span("x", () => {
          appCtx.logger.info("counted", { total: 1n });
        }),
      logger,
    );

    expect(logger.info).toHaveBeenCalledWith(
      "counted",
      expect.objectContaining({ total: 1n }),
    );
    expect(findSpan(snapshot?.spans ?? [], "x")?.logs[0]?.attributes).toEqual({
      unserializable: expect.stringContaining("BigInt") as unknown,
    });
  });
});

describe("createPlumixHandler — deferred work in the snapshot", () => {
  test("a ctx.defer call inside span x is a defer span under x, and the spans its work opened nest under it", async () => {
    const snapshot = await snapshotOfWork((appCtx) =>
      appCtx.telemetry.span("x", () => {
        appCtx.defer(
          appCtx.telemetry.span("purge", async () => {
            await Promise.resolve();
            appCtx.telemetry.span("purge call", () => undefined);
          }),
        );
      }),
    );

    const x = findSpan(snapshot?.spans ?? [], "x");
    expect(x?.children.map((c) => c.name)).toEqual(["defer"]);
    const defer = x?.children[0];
    expect(defer).toMatchObject({ status: "ok" });
    expect(defer?.children.map((c) => c.name)).toEqual(["purge"]);
    expect(defer?.children[0]?.children.map((c) => c.name)).toEqual([
      "purge call",
    ]);
  });

  test("a deferred promise that rejects is its defer span's error, and is still logged", async () => {
    const logger = spyLogger();
    const snapshot = await snapshotOfWork(
      (appCtx) =>
        appCtx.telemetry.span("x", () => {
          appCtx.defer(Promise.reject(new TypeError("purge failed")));
        }),
      logger,
    );

    const defer = findSpan(snapshot?.spans ?? [], "defer");
    expect(defer).toMatchObject({
      status: "error",
      error: { name: "TypeError", message: "purge failed" },
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[plumix] deferred promise rejected: purge failed",
      expect.anything(),
    );
  });

  test("the consumer gets the snapshot only once deferred work, and the work it defers, has settled", async () => {
    const outer = manualPromise();
    const inner = manualPromise();
    const snapshots: TelemetrySnapshot[] = [];
    const handler = await handlerFor({
      plugins: [
        working((appCtx) => {
          appCtx.defer(outer.promise.then(() => appCtx.defer(inner.promise)));
        }),
      ],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    vi.useFakeTimers();
    onTestFinished(() => void vi.useRealTimers());

    await handler.fetch(new Request("https://cms.example/work"), {
      env: {},
      waitUntil: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toEqual([]);

    outer.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toEqual([]);

    inner.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toHaveLength(1);
    const defers: TelemetrySpan[] = [];
    const collect = (spans: readonly TelemetrySpan[]): void => {
      for (const span of spans) {
        if (span.name === "defer") defers.push(span);
        collect(span.children);
      }
    };
    collect(snapshots[0]?.spans ?? []);
    expect(defers.map((d) => d.status)).toEqual(["ok", "ok"]);
  });

  test("deferred work that never settles is delivered at 10s, its span unfinished and timed to the deadline", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const handler = await handlerFor({
      plugins: [
        working((appCtx) => {
          appCtx.defer(new Promise(() => undefined));
        }),
      ],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    vi.useFakeTimers();
    onTestFinished(() => void vi.useRealTimers());

    await handler.fetch(new Request("https://cms.example/work"), {
      env: {},
      waitUntil: () => undefined,
    });
    const respondedAt = Date.now();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(snapshots).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots).toHaveLength(1);
    const defer = findSpan(snapshots[0]?.spans ?? [], "defer");
    expect(defer?.status).toBe("unfinished");
    expect((defer?.startedAt ?? 0) + (defer?.durationMs ?? 0)).toBe(
      respondedAt + 10_000,
    );
  });

  test("request.durationMs is the time to the response, not to when deferred work settled", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const handler = await handlerFor({
      plugins: [
        working(async (appCtx) => {
          await after(30);
          appCtx.defer(after(5_000));
        }),
      ],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    vi.useFakeTimers();
    onTestFinished(() => void vi.useRealTimers());

    const responded = handler.fetch(new Request("https://cms.example/work"), {
      env: {},
      waitUntil: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(30);
    await responded;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(snapshots[0]?.request.durationMs).toBe(30);
    expect(findSpan(snapshots[0]?.spans ?? [], "defer")?.durationMs).toBe(
      5_000,
    );
  });

  test("dispose() with a 5s drain delivers a waiting snapshot before it returns, its open spans unfinished", async () => {
    const order: string[] = [];
    const snapshots: TelemetrySnapshot[] = [];
    const handler = await handlerFor(
      {
        plugins: [
          working((appCtx) => {
            appCtx.defer(new Promise(() => undefined));
          }),
        ],
        telemetry: {
          consumers: [
            {
              id: "in-test",
              onRequestEnd: (s) => {
                order.push("delivered");
                snapshots.push(s);
              },
            },
          ],
        },
      },
      { disposeTimeoutMs: 5_000 },
    );
    vi.useFakeTimers();
    onTestFinished(() => void vi.useRealTimers());
    await handler.fetch(new Request("https://cms.example/work"), { env: {} });
    const respondedAt = Date.now();

    const disposing = handler
      .dispose?.()
      .then(() => void order.push("disposed"));
    await vi.advanceTimersByTimeAsync(5_000);
    await disposing;

    expect(order).toEqual(["delivered", "disposed"]);
    const defer = findSpan(snapshots[0]?.spans ?? [], "defer");
    expect(defer?.status).toBe("unfinished");
    expect((defer?.startedAt ?? 0) + (defer?.durationMs ?? 0)).toBe(
      respondedAt + 5_000,
    );
  });

  test("a scheduled run's deferred work is in that run's snapshot", async () => {
    const later = manualPromise();
    const snapshots: TelemetrySnapshot[] = [];
    const deferringTask = definePlugin("reports", {
      setup: (ctx) => {
        ctx.registerScheduledTask({
          id: "digest",
          handler: (appCtx) => {
            appCtx.defer(
              later.promise.then(() =>
                appCtx.telemetry.span("send digest", () => undefined),
              ),
            );
          },
        });
      },
    });
    const handler = await handlerFor({
      plugins: [deferringTask],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const waited: Promise<unknown>[] = [];

    await handler.scheduled?.(
      { scheduledTime: 0, cron: UNCLAIMED_CRON },
      { env: {}, waitUntil: (promise) => void waited.push(promise) },
    );
    expect(snapshots).toEqual([]);
    later.resolve();
    await Promise.all(waited);

    const task = findSpan(snapshots[0]?.spans ?? [], "cron: digest");
    expect(findSpan(task?.children ?? [], "defer")?.status).toBe("ok");
    expect(findSpan(task?.children ?? [], "send digest")).toBeDefined();
  });
});
