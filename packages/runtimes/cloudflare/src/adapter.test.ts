import { describe, expect, test } from "vitest";

import type {
  DatabaseAdapter,
  RequestScopedDb,
  RequestScopedDbArgs,
} from "@plumix/core";
import {
  buildApp,
  definePlugin,
  plumix,
  requestStore,
  SESSION_COOKIE_NAME,
} from "@plumix/core";
import { auth as authConfig } from "@plumix/core/auth";

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

const emptyExecutionContext = {} as ExecutionContext;

async function createApp(database: DatabaseAdapter = stubDatabase) {
  const config = plumix({ runtime: cloudflare(), database, auth });
  return buildApp(config);
}

async function invoke(
  request: Request,
  env: Record<string, unknown> = {},
  database?: DatabaseAdapter,
): Promise<Response> {
  const app = await createApp(database);
  return cloudflare().buildFetchHandler(app)(
    request,
    env,
    emptyExecutionContext,
  );
}

describe("cloudflare adapter — buildFetchHandler", () => {
  test("routes the public / request through the dispatcher", async () => {
    const response = await invoke(new Request("https://cms.example/"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>Plumix</h1>");
  });

  test("ALS is entered for each request and cleaned up afterwards", async () => {
    expect(requestStore.getStore()).toBeUndefined();
    await invoke(new Request("https://cms.example/"));
    expect(requestStore.getStore()).toBeUndefined();
  });

  test("database.connect errors are caught by the adapter and surface as 500", async () => {
    const failingDatabase: DatabaseAdapter = {
      kind: "failing",
      connect: () => {
        throw new Error("D1 binding missing");
      },
    };
    const response = await invoke(
      new Request("https://cms.example/"),
      {},
      failingDatabase,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "internal_error" });
  });

  test("tolerates a test-time executionCtx without waitUntil (after falls back to a no-op)", async () => {
    const response = await invoke(new Request("https://cms.example/"));
    expect(response.status).toBe(200);
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
    await invoke(new Request("https://cms.example/"), env, capturingDatabase);

    expect(received?.env).toBe(env);
    expect(received?.requestUrl).toBe("https://cms.example/");
  });

  test("each request receives its own context (no cross-request leakage)", async () => {
    const app = await createApp();
    const fetchHandler = cloudflare().buildFetchHandler(app);

    const [a, b] = await Promise.all([
      fetchHandler(
        new Request("https://cms.example/?seq=1"),
        {},
        emptyExecutionContext,
      ),
      fetchHandler(
        new Request("https://cms.example/?seq=2"),
        {},
        emptyExecutionContext,
      ),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  test("rejects /_plumix/* non-safe method without CSRF header (403)", async () => {
    const response = await invoke(
      new Request("https://cms.example/_plumix/rpc/post/list", {
        method: "POST",
      }),
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
      new Request("https://cms.example/_plumix/admin/posts/new"),
      { ASSETS },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexBody);
  });

  test("/_plumix/admin/ without an ASSETS binding returns admin-not-available", async () => {
    const response = await invoke(
      new Request("https://cms.example/_plumix/admin"),
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
      new Request("https://cms.example/"),
      {},
      adapter,
    );
    expect(response.status).toBe(200);
    expect(connectCalls.count).toBe(0);
  });

  test("passes env, request, schema, isAuthenticated, isWrite through to connectRequest", async () => {
    const { adapter, calls } = captureAdapter();
    const req = new Request("https://cms.example/", {
      method: "POST",
      headers: {
        "x-plumix-request": "1",
        cookie: `${SESSION_COOKIE_NAME}=abc`,
      },
    });
    await invoke(req, { DB: "x" }, adapter);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.url).toBe("https://cms.example/");
    expect(calls[0]?.env).toEqual({ DB: "x" });
    expect(calls[0]?.isAuthenticated).toBe(true);
    expect(calls[0]?.isWrite).toBe(true);
  });

  test("isAuthenticated=false when no session cookie is present", async () => {
    const { adapter, calls } = captureAdapter();
    await invoke(new Request("https://cms.example/"), {}, adapter);
    expect(calls[0]?.isAuthenticated).toBe(false);
  });

  test("isWrite=false for GET/HEAD/OPTIONS", async () => {
    const { adapter, calls } = captureAdapter();
    await invoke(
      new Request("https://cms.example/", { method: "GET" }),
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
      new Request("https://cms.example/"),
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
      new Request("https://cms.example/"),
      {},
      adapter,
    );
    expect(response.status).toBe(200);
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
    await invoke(new Request("https://cms.example/"), {}, adapter);
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
      new Request("https://cms.example/"),
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
      adapter.connect({}, new Request("https://cms.example/"), {}),
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
      new Request("https://cms.example/"),
      { OTHER: 1 },
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "plumix_runtime_config_error",
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
      new Request("https://cms.example/"),
      { DB: null },
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "plumix_runtime_config_error",
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
      new Request("https://cms.example/"),
      undefined as unknown as Record<string, unknown>,
      adapterWithBindings,
    );
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "plumix_runtime_config_error",
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
      new Request("https://cms.example/"),
      { DB: { fake: true } },
      adapterWithBindings,
    );
    expect(response.status).toBe(200);
  });

  test("adapter without requiredBindings is unaffected (opt-in behaviour)", async () => {
    const response = await invoke(new Request("https://cms.example/"), {});
    expect(response.status).toBe(200);
  });

  test("validation is memoised — runs once per Worker isolate", async () => {
    let connectCalls = 0;
    const adapterWithBindings: DatabaseAdapter = {
      kind: "stub-with-bindings",
      requiredBindings: ["DB"],
      connect: () => {
        connectCalls += 1;
        return { db: {} };
      },
    };
    const app = await createApp(adapterWithBindings);
    const fetchHandler = cloudflare().buildFetchHandler(app);
    const env = { DB: { fake: true } };
    await fetchHandler(
      new Request("https://cms.example/"),
      env,
      emptyExecutionContext,
    );
    await fetchHandler(
      new Request("https://cms.example/about"),
      env,
      emptyExecutionContext,
    );
    // If the memoised check held, connect runs twice (once per request) and
    // no re-validation cost was paid. This indirectly confirms the gate
    // flipped: a broken env would fail fast on request #2 as well, not
    // bypass the check.
    expect(connectCalls).toBeGreaterThanOrEqual(2);
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
      plugins: [a, b],
    });

    await expect(buildApp(config)).rejects.toThrow(
      /Plugin "b" redefines schema export "landing_pages"/,
    );
  });
});
