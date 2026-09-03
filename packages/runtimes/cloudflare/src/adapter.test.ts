import type {
  AssetsBinding,
  DatabaseAdapter,
  Invocation,
  PluginDescriptor,
  RequestScopedDb,
  RequestScopedDbArgs,
  TelemetrySnapshot,
} from "plumix";
import type { AssetsNotFound } from "plumix/test/conformance";
import {
  auth as authConfig,
  buildApp,
  definePlugin,
  defineTheme,
  plumix,
  requestStore,
  SESSION_COOKIE_NAME,
} from "plumix";
import { describeAssetsContract } from "plumix/test/conformance";
import { describe, expect, test } from "vitest";

import { cloudflare } from "./adapter.js";
import { d1 } from "./d1.js";

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};

const auth = authConfig({
  passkey: {
    rpName: "Plumix Test",
    rpId: "cms.example",
    origin: "https://cms.example",
  },
});

const theme = defineTheme({ templates: () => null });

async function createApp(
  database: DatabaseAdapter = stubDatabase,
  plugins: PluginDescriptor[] = [],
) {
  const config = plumix({
    runtime: cloudflare(),
    database,
    auth,
    theme,
    plugins,
  });
  return buildApp(config);
}

// Build app → `createHandler` → `fetch(request, invocation)`: the seam every
// runtime adapter conforms to. `env` is `unknown` because the tests hand the
// handler deliberately broken bags (a null binding, no object at all).
async function invoke(
  request: Request,
  env: unknown,
  database?: DatabaseAdapter,
  plugins?: PluginDescriptor[],
): Promise<Response> {
  const app = await createApp(database, plugins);
  return cloudflare()
    .createHandler(app)
    .fetch(request, { env: env as Invocation["env"] });
}

/**
 * The assets layer as core receives it, captured off `ctx.assets` in a plugin
 * route. `readAssetsBinding` hands the binding through unchanged today, so the
 * conformance run below pins the pass-through and the shape guard in front of
 * it — not the layer's own behaviour, which no local pool can execute.
 */
async function assetsFromContext(
  ASSETS: AssetsBinding,
): Promise<AssetsBinding> {
  let captured: AssetsBinding | undefined;
  const capture = definePlugin("capture-assets", {
    setup: (ctx) => {
      ctx.registerPublicRoute({
        path: "/__assets-probe",
        handler: (_request, appCtx) => {
          captured = appCtx.assets;
          return new Response("ok");
        },
      });
    },
  });
  await invoke(
    new Request("https://cms.example/__assets-probe"),
    { ASSETS },
    stubDatabase,
    [capture],
  );
  if (!captured) throw new Error("the adapter exposed no assets binding");
  return captured;
}

describe("cloudflare adapter — createHandler().fetch", () => {
  test("routes the public / request through the dispatcher", async () => {
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe(
      "public-route-not-found",
    );
  });

  test("ALS is entered for each request and cleaned up afterwards", async () => {
    expect(requestStore.getStore()).toBeUndefined();
    await invoke(new Request("https://cms.example/unknown"), {});
    expect(requestStore.getStore()).toBeUndefined();
  });

  test("database.connect errors are caught by the handler and surface as 500", async () => {
    const failingDatabase: DatabaseAdapter = {
      kind: "failing",
      connect: () => {
        throw new Error("D1 binding missing");
      },
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
      failingDatabase,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "internal_error" });
  });

  test("serves a request whose invocation carries no waitUntil", async () => {
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
    );
    expect(response.status).toBe(404);
  });

  test("telemetry consumers get the snapshot through waitUntil, off the response path", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const config = plumix({
      runtime: cloudflare(),
      database: stubDatabase,
      auth,
      theme,
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
      },
    });
    const app = await buildApp(config);
    const waited: Promise<unknown>[] = [];

    const response = await cloudflare()
      .createHandler(app)
      .fetch(new Request("https://cms.example/unknown"), {
        env: {},
        waitUntil: (promise) => void waited.push(promise),
      });

    // Delivery was routed through waitUntil — never awaited before returning.
    expect(waited.length).toBeGreaterThan(0);
    await Promise.all(waited);
    expect(snapshots).toHaveLength(1);
    const [snapshot] = snapshots;
    expect(snapshot?.request).toMatchObject({
      method: "GET",
      url: "https://cms.example/unknown",
      status: response.status,
    });
    expect(snapshot?.spans.map((s) => s.name)).toEqual(["dispatch"]);
  });

  test("passes the env + request through to the database adapter", async () => {
    let received: { env: unknown; requestUrl: string } | undefined;
    const capturingDatabase: DatabaseAdapter = {
      kind: "capture",
      connect: (env, request) => {
        received = { env, requestUrl: request.url };
        return { db: {} };
      },
    };

    const env = { DB: "binding-placeholder" };
    await invoke(
      new Request("https://cms.example/unknown"),
      env,
      capturingDatabase,
    );

    expect(received?.env).toBe(env);
    expect(received?.requestUrl).toBe("https://cms.example/unknown");
  });

  // Every invocation the Worker entry builds carries `waitUntil`, so the drain
  // set is always empty here; the adapter still has to pass `dispose` through.
  test("exposes dispose(), and it resolves at once", async () => {
    const handler = cloudflare().createHandler(await createApp());

    const outcome = await Promise.race([
      handler.dispose?.().then(() => "disposed" as const),
      new Promise<"waiting">((resolve) =>
        setTimeout(() => resolve("waiting"), 50),
      ),
    ]);

    expect(outcome).toBe("disposed");
  });

  test("each request receives its own context (no cross-request leakage)", async () => {
    const app = await createApp();
    const handler = cloudflare().createHandler(app);

    const [a, b] = await Promise.all([
      handler.fetch(new Request("https://cms.example/unknown?seq=1"), {
        env: {},
      }),
      handler.fetch(new Request("https://cms.example/unknown?seq=2"), {
        env: {},
      }),
    ]);

    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
  });

  test("rejects /_plumix/* non-safe method without CSRF header (403)", async () => {
    const response = await invoke(
      new Request("https://cms.example/_plumix/rpc/post/list", {
        method: "POST",
      }),
      {},
    );
    expect(response.status).toBe(403);
  });

  test("env.ASSETS is exposed through the assets slot so /_plumix/admin/ deep links resolve", async () => {
    const indexBody = "<!doctype html><title>admin</title>";
    const ASSETS = {
      fetch: (_request: Request): Promise<Response> =>
        Promise.resolve(
          new Response(indexBody, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
    };

    const response = await invoke(
      new Request("https://cms.example/_plumix/admin/entries/new"),
      { ASSETS },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexBody);
  });

  test("supplies cf-connecting-ip as the trusted client address", async () => {
    const echo = definePlugin("echo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/whoami",
        handler: (_request, appCtx) =>
          new Response(appCtx.clientAddress ?? "none"),
      });
    });
    const app = await buildApp(
      plumix({
        runtime: cloudflare(),
        database: stubDatabase,
        auth,
        theme,
        plugins: [echo],
      }),
    );

    const response = await cloudflare()
      .createHandler(app)
      .fetch(
        new Request("https://cms.example/whoami", {
          headers: { "cf-connecting-ip": "203.0.113.7" },
        }),
        { env: {} },
      );

    expect(await response.text()).toBe("203.0.113.7");
  });

  test("/_plumix/admin/ without an ASSETS binding returns admin-not-available", async () => {
    const response = await invoke(
      new Request("https://cms.example/_plumix/admin"),
      {},
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-not-available");
  });

  test("a malformed env.ASSETS (no fetch function) falls back to admin-not-available", async () => {
    const response = await invoke(
      new Request("https://cms.example/_plumix/admin"),
      { ASSETS: { fetch: "not-a-function" } },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-not-available");
  });
});

function captureAdapter(): {
  adapter: DatabaseAdapter;
  calls: RequestScopedDbArgs[];
  connectCalls: { count: number };
} {
  const calls: RequestScopedDbArgs[] = [];
  const connectCalls = { count: 0 };
  const adapter: DatabaseAdapter = {
    kind: "capture",
    connect: () => {
      connectCalls.count++;
      return { db: {} };
    },
    connectRequest: (args) => {
      calls.push(args);
      return { db: {}, commit: (r) => r };
    },
  };
  return { adapter, calls, connectCalls };
}

describe("cloudflare adapter — connectRequest", () => {
  test("when connectRequest returns a scoped db, connect is not called", async () => {
    const { adapter, connectCalls } = captureAdapter();
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
      adapter,
    );
    expect(response.status).toBe(404);
    expect(connectCalls.count).toBe(0);
  });

  test("passes env, request, schema, isAuthenticated, isWrite through to connectRequest", async () => {
    const { adapter, calls } = captureAdapter();
    const req = new Request("https://cms.example/unknown", {
      method: "POST",
      headers: {
        "x-plumix-request": "1",
        cookie: `${SESSION_COOKIE_NAME}=abc`,
      },
    });
    await invoke(req, { DB: "x" }, adapter);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.url).toBe("https://cms.example/unknown");
    expect(calls[0]?.env).toEqual({ DB: "x" });
    expect(calls[0]?.isAuthenticated).toBe(true);
    expect(calls[0]?.isWrite).toBe(true);
  });

  test("isAuthenticated=false when no session cookie is present", async () => {
    const { adapter, calls } = captureAdapter();
    await invoke(new Request("https://cms.example/unknown"), {}, adapter);
    expect(calls[0]?.isAuthenticated).toBe(false);
  });

  test("isWrite=false for GET/HEAD/OPTIONS", async () => {
    const { adapter, calls } = captureAdapter();
    await invoke(
      new Request("https://cms.example/unknown", { method: "GET" }),
      {},
      adapter,
    );
    expect(calls[0]?.isWrite).toBe(false);
  });

  test("commit runs on the response and its return value is what the handler returns", async () => {
    const adapter: DatabaseAdapter = {
      kind: "commit",
      connect: () => ({ db: {} }),
      connectRequest: () => ({
        db: {},
        commit: (response) => {
          const next = new Response(response.body, response);
          next.headers.set("x-commit-ran", "1");
          return next;
        },
      }),
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
      adapter,
    );
    expect(response.headers.get("x-commit-ran")).toBe("1");
  });

  test("falls back to connect when connectRequest returns null", async () => {
    const fallbackDb = { __fallback: true };
    let connectCalled = 0;
    const adapter: DatabaseAdapter = {
      kind: "null-scoped",
      connect: () => {
        connectCalled++;
        return { db: fallbackDb };
      },
      connectRequest: () => null,
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
      adapter,
    );
    expect(response.status).toBe(404);
    expect(connectCalled).toBe(1);
  });

  test("falls back to connect when connectRequest is not implemented", async () => {
    let connectCalled = 0;
    const adapter: DatabaseAdapter = {
      kind: "no-scoped",
      connect: () => {
        connectCalled++;
        return { db: {} };
      },
    };
    await invoke(new Request("https://cms.example/unknown"), {}, adapter);
    expect(connectCalled).toBe(1);
  });

  test("connectRequest throwing surfaces as 500 like connect", async () => {
    const adapter: DatabaseAdapter = {
      kind: "throwing",
      connect: () => ({ db: {} }),
      connectRequest: () => {
        throw new Error("scoped init failed");
      },
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
      adapter,
    );
    expect(response.status).toBe(500);
  });

  // Type-level sanity: the imported types are usable at runtime.
  test("RequestScopedDb type is exported from core", () => {
    const noop: RequestScopedDb = { db: {}, commit: (r) => r };
    expect(noop.commit(new Response("x")).status).toBe(200);
  });
});

describe("cloudflare adapter — d1() slot", () => {
  test("throws a descriptive error when the configured binding is missing from env", () => {
    const adapter = d1({ binding: "DB" });
    expect(() =>
      adapter.connect({}, new Request("https://cms.example/unknown"), {}),
    ).toThrow(/D1 binding "DB" missing/);
  });

  test("declares requiredBindings for the configured binding name", () => {
    const adapter = d1({ binding: "MAIN_DB" });
    expect(adapter.requiredBindings).toEqual(["MAIN_DB"]);
  });
});

describe("cloudflare adapter — binding validation", () => {
  test("surfaces a boot-time error listing every missing binding", async () => {
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB", "CACHE"],
      connect: () => ({ db: {} }),
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      { OTHER: 1 },
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "bindings_missing",
      missing: ["DB", "CACHE"],
    });
  });

  test("treats a null-valued binding as missing", async () => {
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB"],
      connect: () => ({ db: {} }),
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      { DB: null },
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "bindings_missing",
      missing: ["DB"],
    });
  });

  test("handles a non-object env without crashing with a TypeError", async () => {
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB"],
      connect: () => ({ db: {} }),
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      undefined,
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "bindings_missing",
      missing: ["DB"],
    });
  });

  test("satisfied requiredBindings permit the request to dispatch", async () => {
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB"],
      connect: () => ({ db: {} }),
    };
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      { DB: { fake: true } },
      adapterWithBindings,
    );
    expect(response.status).toBe(404);
  });

  test("adapter without requiredBindings is unaffected (opt-in behaviour)", async () => {
    const response = await invoke(
      new Request("https://cms.example/unknown"),
      {},
    );
    expect(response.status).toBe(404);
  });

  test("validation is memoised per handler: the first env's verdict holds", async () => {
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB"],
      connect: () => ({ db: {} }),
    };
    const app = await createApp(adapterWithBindings);
    const handler = cloudflare().createHandler(app);
    const first = await handler.fetch(
      new Request("https://cms.example/unknown"),
      { env: { DB: { fake: true } } },
    );
    expect(first.status).toBe(404);
    // Without the memo this request would be the readable 500 above.
    const second = await handler.fetch(
      new Request("https://cms.example/about"),
      { env: {} },
    );
    expect(second.status).toBe(404);
  });
});

describe("plugin schema collisions", () => {
  test("buildApp rejects a plugin that redefines a core table", async () => {
    const misbehaving = definePlugin("collides", () => undefined, {
      schema: { users: { fake: true } },
    });
    const config = plumix({
      runtime: cloudflare(),
      database: { kind: "stub", connect: () => ({ db: {} }) },
      auth,
      theme,
      plugins: [misbehaving],
    });

    await expect(buildApp(config)).rejects.toThrow(
      /redefines schema export "users"/,
    );
  });

  test("buildApp rejects two plugins that export the same table name", async () => {
    const a = definePlugin("a", () => undefined, {
      schema: { landing_pages: { fake: "a" } },
    });
    const b = definePlugin("b", () => undefined, {
      schema: { landing_pages: { fake: "b" } },
    });
    const config = plumix({
      runtime: cloudflare(),
      database: { kind: "stub", connect: () => ({ db: {} }) },
      auth,
      theme,
      plugins: [a, b],
    });

    await expect(buildApp(config)).rejects.toThrow(
      /Plugin "b" redefines schema export "landing_pages"/,
    );
  });
});

const ADMIN_SHELL = "<!doctype html><title>admin</title>";
const ADMIN_SHELL_PATH = "/_plumix/admin/";
const ADMIN_ASSET_PATH = "/_plumix/admin/assets/index-abc123.js";

// Workers Assets in both configurations this repo deploys: `not_found_handling:
// "none"` (the scaffold, so an unmatched path reaches the Worker) answers 404,
// and `"single-page-application"` (several plugin playgrounds) answers with the
// shell. The contract is run against both, because the adapter hands core the
// binding either way.
function workersAssets(notFound: AssetsNotFound): AssetsBinding {
  const files: Readonly<Record<string, { body: string; type: string }>> = {
    [ADMIN_SHELL_PATH]: { body: ADMIN_SHELL, type: "text/html; charset=utf-8" },
    [ADMIN_ASSET_PATH]: {
      body: "export const admin = 1;",
      type: "text/javascript",
    },
  };
  return {
    fetch: (request) => {
      const file = files[new URL(request.url).pathname];
      if (file) {
        return Promise.resolve(
          new Response(file.body, {
            status: 200,
            headers: { "content-type": file.type },
          }),
        );
      }
      return Promise.resolve(
        notFound === "spa"
          ? new Response(ADMIN_SHELL, {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" },
            })
          : new Response("Not Found", {
              status: 404,
              headers: { "content-type": "text/plain" },
            }),
      );
    },
  };
}

describe("cloudflare adapter — assets slot", () => {
  // The binding is stateless, and every case would otherwise build an app and
  // dispatch a request of its own to reach the same object.
  const bindings = new Map<AssetsNotFound, Promise<AssetsBinding>>();
  const connect = (notFound: AssetsNotFound) => () => {
    const existing = bindings.get(notFound);
    if (existing) return existing;
    const captured = assetsFromContext(workersAssets(notFound));
    bindings.set(notFound, captured);
    return captured;
  };

  describeAssetsContract({
    connect: connect("404"),
    assetPath: ADMIN_ASSET_PATH,
    shellPath: ADMIN_SHELL_PATH,
    notFound: "404",
  });

  describeAssetsContract({
    connect: connect("spa"),
    assetPath: ADMIN_ASSET_PATH,
    shellPath: ADMIN_SHELL_PATH,
    notFound: "spa",
  });
});
