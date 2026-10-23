import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";

import type { Mailer } from "../auth/contract/mailer.js";
import type { AppContext } from "./app-context.js";
import { testConfig } from "../test/config.js";
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
      config: testConfig({
        // The config slot now accepts an `(env) => Mailer` resolver; the
        // context must hand consumers the resolved transport, with the request
        // env.
        mailer: (env) => {
          seenEnv.push(env);
          return mailer;
        },
      }),
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
      config: testConfig({ mailer }),
    });

    await ctx.mailer?.send({ to: "u@example.com", subject: "s", text: "t" });
    expect(sent).toEqual(["u@example.com"]);
  });
});

describe("createAppContext origin resolution", () => {
  const baseArgs = (
    harness: Awaited<ReturnType<typeof createDispatcherHarness>>,
    request: Request,
  ) => ({
    db: harness.db,
    env: harness.env,
    request,
    config: harness.app.config,
    hooks: harness.app.hooks,
    plugins: harness.app.plugins,
  });

  test("resolves an (env) => origin resolver into ctx.origin", async () => {
    const harness = await createDispatcherHarness({
      env: { PUBLIC_ORIGIN: "https://example.com" },
    });
    const seenEnv: unknown[] = [];

    const ctx = createAppContext({
      ...baseArgs(harness, new Request("https://worker.acme.workers.dev/")),
      origin: (env) => {
        seenEnv.push(env);
        return (env as { PUBLIC_ORIGIN: string }).PUBLIC_ORIGIN;
      },
    });

    expect(ctx.origin).toBe("https://example.com");
    expect(seenEnv).toEqual([harness.env]);
  });

  test("uses a literal origin verbatim, not the request host", async () => {
    const harness = await createDispatcherHarness();
    const ctx = createAppContext({
      ...baseArgs(harness, new Request("https://worker.acme.workers.dev/")),
      origin: "https://example.com",
    });
    expect(ctx.origin).toBe("https://example.com");
  });

  test("falls back to the request origin when none is configured", async () => {
    const harness = await createDispatcherHarness();
    const ctx = createAppContext(
      baseArgs(harness, new Request("https://fallback.example/admin")),
    );
    expect(ctx.origin).toBe("https://fallback.example");
  });
});

describe("createAppContext platform I/O tracing", () => {
  test("assets, storage, cdn, and mailer slots are wrapped in telemetry spans", async () => {
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
      cdn: {
        decorate: (response) => response,
        store: {
          match: () => Promise.resolve(undefined),
          put: () => Promise.resolve(),
        },
        purgeTags: () => Promise.resolve(),
      },
      config: testConfig({
        mailer: { send: () => Promise.resolve() },
        // A consumer without `sample` always votes yes, activating the real
        // collector — the same seam production uses.
        telemetry: { consumers: [{ id: "in-test" }] },
      }),
    });

    await ctx.assets?.fetch(new Request("https://cms.example/x"));
    await ctx.storage?.get("k");
    await ctx.cdn?.store?.match(new Request("https://cms.example/"));
    await ctx.mailer?.send({ to: "u@example.com", subject: "s", text: "t" });

    expect(ctx.telemetry.getSpans().map((s) => s.name)).toEqual([
      "assets: fetch",
      "storage: get",
      "cdn: match",
      "mailer: send",
    ]);
  });
});

describe("createAppContext ctx.fetch timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Both upstreams reject with their signal's reason once it aborts, the way
  // the platform `fetch` does.
  function silentUpstream(): typeof globalThis.fetch {
    return async (_input, init) => {
      await new Promise((resolve) => {
        init?.signal?.addEventListener("abort", resolve, { once: true });
      });
      init?.signal?.throwIfAborted();
      return new Response("unreachable");
    };
  }

  function upstreamAnsweringAfter(ms: number): typeof globalThis.fetch {
    return async (_input, init) => {
      await new Promise((resolve) => {
        setTimeout(resolve, ms);
        init?.signal?.addEventListener("abort", resolve, { once: true });
      });
      init?.signal?.throwIfAborted();
      return new Response("done");
    };
  }

  // Node's `AbortSignal.timeout` runs on an internal timer the fake clock
  // can't reach, so the clock stub rebuilds it on the faked `setTimeout`.
  function useFakeClock(): void {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort(
          new DOMException("The operation timed out.", "TimeoutError"),
        );
      }, ms);
      return controller.signal;
    });
  }

  async function fetchContext(): Promise<ReturnType<typeof createAppContext>> {
    const harness = await createDispatcherHarness();
    return createAppContext({
      db: harness.db,
      env: harness.env,
      request: new Request("https://cms.example/"),
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
      // A consumer without `sample` activates the real collector.
      config: testConfig({ telemetry: { consumers: [{ id: "in-test" }] } }),
    });
  }

  test("a call to an upstream that never answers rejects with TimeoutError after 10s", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", silentUpstream());
    useFakeClock();
    let failure: unknown;

    void ctx.fetch("https://slow.example/").catch((error: unknown) => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(failure).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toBeInstanceOf(DOMException);
    expect(failure).toMatchObject({ name: "TimeoutError" });
  });

  test("a call passing { timeout: 2000 } rejects with TimeoutError after 2s", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", silentUpstream());
    useFakeClock();
    let failure: unknown;

    void ctx
      .fetch("https://slow.example/", { timeout: 2000 })
      .catch((error: unknown) => {
        failure = error;
      });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(failure).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toMatchObject({ name: "TimeoutError" });
  });

  test("a call passing { timeout: false } waits for an upstream that answers after a minute", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", upstreamAnsweringAfter(60_000));
    useFakeClock();

    const call = ctx.fetch("https://download.example/", { timeout: false });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await (await call).text()).toBe("done");
  });

  test("a caller's signal that aborts first rejects with that signal's reason", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", silentUpstream());
    useFakeClock();
    const caller = new AbortController();
    const reason = new Error("the visitor left");
    let failure: unknown;

    void ctx
      .fetch("https://slow.example/", { signal: caller.signal })
      .catch((error: unknown) => {
        failure = error;
      });
    setTimeout(() => caller.abort(reason), 500);
    await vi.advanceTimersByTimeAsync(500);

    expect(failure).toBe(reason);
  });

  test("a Request input's own signal still aborts the call", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", silentUpstream());
    useFakeClock();
    const caller = new AbortController();
    let failure: unknown;

    void ctx
      .fetch(new Request("https://slow.example/", { signal: caller.signal }))
      .catch((error: unknown) => {
        failure = error;
      });
    setTimeout(() => caller.abort(new Error("the visitor left")), 500);
    await vi.advanceTimersByTimeAsync(500);

    expect(failure).toMatchObject({ message: "the visitor left" });
  });

  test("the platform fetch never receives the timeout key", async () => {
    const ctx = await fetchContext();
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response("ok"));
    });

    await ctx.fetch("https://api.example/", { method: "POST", timeout: 2000 });

    expect(seen.map((init) => Object.keys(init).sort())).toEqual([
      ["method", "signal"],
    ]);
  });

  test("a timed-out call's span says it timed out and after how long", async () => {
    const ctx = await fetchContext();
    vi.stubGlobal("fetch", silentUpstream());
    useFakeClock();

    void ctx
      .fetch("https://slow.example/", { timeout: 2000 })
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(2000);

    expect(ctx.telemetry.getSpans()).toMatchObject([
      {
        name: "fetch: GET slow.example",
        status: "error",
        durationMs: 2000,
        error: { name: "TimeoutError", message: "timed out after 2s" },
      },
    ]);
  });

  test("ctx.fetch's init takes a timeout in milliseconds, or false", () => {
    type FetchInit = NonNullable<Parameters<AppContext["fetch"]>[1]>;

    expectTypeOf<FetchInit["timeout"]>().toEqualTypeOf<
      number | false | undefined
    >();
  });
});
