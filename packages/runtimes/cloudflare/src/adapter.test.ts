import { describe, expect, test } from "vitest";

import type { DatabaseAdapter } from "@plumix/core";
import { buildApp, definePlugin, plumix, requestStore } from "@plumix/core";

import { cloudflare } from "./adapter.js";
import { d1 } from "./d1.js";

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};

const auth = {
  passkey: {
    rpName: "Plumix Test",
    rpId: "cms.example",
    origin: "https://cms.example",
  },
};

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
});

describe("cloudflare adapter — d1() slot", () => {
  test("throws a descriptive error when the configured binding is missing from env", () => {
    const adapter = d1({ binding: "DB" });
    expect(() =>
      adapter.connect({}, new Request("https://cms.example/"), {}),
    ).toThrow(/D1 binding "DB" missing/);
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
