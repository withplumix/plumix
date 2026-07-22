import type { SQL } from "drizzle-orm";
import type {
  DatabaseAdapter,
  RequestScopedDb,
  RequestScopedDbArgs,
} from "plumix";
import { sql } from "drizzle-orm";
import { requestStore } from "plumix";
import { describe, expect, test } from "vitest";

import { d1 } from "./d1.js";

interface FakeSession {
  readonly constraint: string;
  bookmark: string | null;
  getBookmark(): string | null;
}

interface FakeBinding {
  readonly sessions: FakeSession[];
  withSession(constraint: string): FakeSession;
}

function fakeBinding(newBookmark: string | null = "bookmark-new"): FakeBinding {
  const sessions: FakeSession[] = [];
  return {
    sessions,
    withSession(constraint) {
      const session: FakeSession = {
        constraint,
        bookmark: newBookmark,
        getBookmark() {
          return this.bookmark;
        },
      };
      sessions.push(session);
      return session;
    },
  };
}

function argsFor(
  binding: FakeBinding,
  request: Request,
  opts: { isAuthenticated: boolean; isWrite: boolean },
): RequestScopedDbArgs {
  return {
    env: { DB: binding as unknown as D1Database },
    request,
    schema: {},
    isAuthenticated: opts.isAuthenticated,
    isWrite: opts.isWrite,
  };
}

function callScoped(
  adapter: DatabaseAdapter,
  args: RequestScopedDbArgs,
): RequestScopedDb {
  const fn = adapter.connectRequest;
  if (!fn) throw new Error("expected adapter.connectRequest to be defined");
  const result = fn(args);
  if (result === null) throw new Error("expected a non-null scoped db");
  return result;
}

describe("d1() adapter — session config", () => {
  test("session undefined → no connectRequest hook (defers to connect)", () => {
    const adapter = d1({ binding: "DB" });
    expect(adapter.connectRequest).toBeUndefined();
  });

  test("session: 'disabled' → no connectRequest hook", () => {
    const adapter = d1({ binding: "DB", session: "disabled" });
    expect(adapter.connectRequest).toBeUndefined();
  });

  test("session: 'auto' → exposes connectRequest", () => {
    const adapter = d1({ binding: "DB", session: "auto" });
    expect(typeof adapter.connectRequest).toBe("function");
  });

  test("session: 'primary-first' → exposes connectRequest", () => {
    const adapter = d1({ binding: "DB", session: "primary-first" });
    expect(typeof adapter.connectRequest).toBe("function");
  });
});

// Captures spans through the TelemetrySpanHandle contract — the same surface
// the real collector implements — so assertions stay driver-level.
function spanCapture(): {
  ctx: unknown;
  spans: { name: string; attributes: Record<string, unknown> }[];
} {
  const spans: { name: string; attributes: Record<string, unknown> }[] = [];
  const telemetry = {
    span: (name: string, fn: (s: unknown) => unknown) => {
      const attributes: Record<string, unknown> = {};
      spans.push({ name, attributes });
      return fn({
        set: (key: string, value: unknown) => {
          attributes[key] =
            typeof value === "function" ? (value as () => unknown)() : value;
        },
      });
    },
  };
  return { ctx: { telemetry }, spans };
}

function resultBinding(results: unknown[] = []): D1Database {
  const stmt = {
    bind: () => stmt,
    run: () =>
      Promise.resolve({ results, success: true, meta: { changes: 0 } }),
    all: () =>
      Promise.resolve({ results, success: true, meta: { changes: 0 } }),
    first: () => Promise.resolve(null),
    raw: () => Promise.resolve([]),
  };
  return { prepare: () => stmt } as unknown as D1Database;
}

describe("d1() adapter — query span tracing", () => {
  test("times each query as a db span with sql/params/rows attributes", async () => {
    const { ctx, spans } = spanCapture();
    const db = d1({ binding: "DB" }).connect(
      { DB: resultBinding([{ id: 1 }, { id: 2 }]) },
      new Request("https://cms.example"),
      {},
    ).db as { all(query: SQL): Promise<unknown> };

    await requestStore.run(ctx as never, async () => {
      await db.all(sql`select id from posts where id = ${7}`);
    });

    expect(spans.map((s) => s.name)).toEqual(["db: select"]);
    expect(spans[0]?.attributes).toEqual({
      "db.sql": "select id from posts where id = ?",
      "db.params": [7],
      "db.rows": 2,
    });
  });

  test("queries inside a transaction are timed spans", async () => {
    const { ctx, spans } = spanCapture();
    const db = d1({ binding: "DB" }).connect(
      { DB: resultBinding() },
      new Request("https://cms.example"),
      {},
    ).db as {
      transaction(fn: (tx: unknown) => Promise<void>): Promise<void>;
    };

    await requestStore.run(ctx as never, () =>
      db.transaction(async (tx) => {
        await (tx as { run(query: SQL): Promise<unknown> }).run(
          sql`update posts set title = ${"t"}`,
        );
      }),
    );

    // begin / update / commit each flow through prepare and get timed.
    expect(spans.map((s) => s.name)).toContain("db: update");
    const update = spans.find((s) => s.name === "db: update");
    expect(update?.attributes["db.sql"]).toBe("update posts set title = ?");
    expect(update?.attributes["db.params"]).toEqual(["t"]);
  });

  test("batch times one span and hands the real bound statements to the binding", async () => {
    const { ctx, spans } = spanCapture();
    const bound: unknown[] = [];
    const received: unknown[][] = [];
    const binding = {
      prepare: () => ({
        bind: (..._args: unknown[]) => {
          const stmt = {
            run: () =>
              Promise.resolve({
                results: [],
                success: true,
                meta: { changes: 0 },
              }),
          };
          bound.push(stmt);
          return stmt;
        },
      }),
      batch: (stmts: unknown[]) => {
        received.push(stmts);
        return Promise.resolve(
          stmts.map(() => ({
            results: [{}],
            success: true,
            meta: { changes: 0 },
          })),
        );
      },
    } as unknown as D1Database;
    const db = d1({ binding: "DB" }).connect(
      { DB: binding },
      new Request("https://cms.example"),
      {},
    ).db as {
      batch(queries: unknown[]): Promise<unknown>;
      run(query: SQL): Promise<unknown>;
    };

    await requestStore.run(ctx as never, () =>
      db.batch([db.run(sql`select 1`), db.run(sql`select 2`)]),
    );

    expect(spans.map((s) => s.name)).toEqual(["db: select (2)"]);
    expect(spans[0]?.attributes).toEqual({
      "db.batch": [
        { sql: "select 1", params: [] },
        { sql: "select 2", params: [] },
      ],
      "db.rows": 2,
    });
    // The unwrap contract: the binding receives the bound originals, never
    // the traced wrappers.
    expect(received).toEqual([bound]);
  });
});

describe("d1() adapter — connectRequest behavior (session: 'auto')", () => {
  const adapter = d1({ binding: "DB", session: "auto" });

  test("writes always use first-primary regardless of auth", () => {
    const binding = fakeBinding();
    callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: false,
        isWrite: true,
      }),
    );
    expect(binding.sessions[0]?.constraint).toBe("first-primary");
  });

  test("authenticated reads with a valid bookmark resume from it", () => {
    const binding = fakeBinding();
    const req = new Request("https://cms.example/", {
      headers: { cookie: "__plumix_d1_bookmark=0000020cf4c8f510-00007c12" },
    });
    callScoped(
      adapter,
      argsFor(binding, req, { isAuthenticated: true, isWrite: false }),
    );
    expect(binding.sessions[0]?.constraint).toBe("0000020cf4c8f510-00007c12");
  });

  test("authenticated reads without a bookmark use first-unconstrained", () => {
    const binding = fakeBinding();
    callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: true,
        isWrite: false,
      }),
    );
    expect(binding.sessions[0]?.constraint).toBe("first-unconstrained");
  });

  test("authenticated reads with an over-long bookmark ignore it", () => {
    // Request constructor rejects cookie values with control chars, so the
    // only realistic "malformed" path reaching isValidBookmark is length.
    const binding = fakeBinding();
    const huge = "a".repeat(1025);
    const req = new Request("https://cms.example/", {
      headers: { cookie: `__plumix_d1_bookmark=${huge}` },
    });
    callScoped(
      adapter,
      argsFor(binding, req, { isAuthenticated: true, isWrite: false }),
    );
    expect(binding.sessions[0]?.constraint).toBe("first-unconstrained");
  });

  test("anonymous reads use first-unconstrained", () => {
    const binding = fakeBinding();
    callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: false,
        isWrite: false,
      }),
    );
    expect(binding.sessions[0]?.constraint).toBe("first-unconstrained");
  });
});

describe("d1() adapter — connectRequest behavior (session: 'primary-first')", () => {
  const adapter = d1({ binding: "DB", session: "primary-first" });

  test("anonymous reads default to first-primary", () => {
    const binding = fakeBinding();
    callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: false,
        isWrite: false,
      }),
    );
    expect(binding.sessions[0]?.constraint).toBe("first-primary");
  });
});

describe("d1() adapter — commit", () => {
  const adapter = d1({ binding: "DB", session: "auto" });

  test("authenticated user with a new bookmark gets a Set-Cookie", () => {
    const binding = fakeBinding("bookmark-new");
    const scoped = callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: true,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("__plumix_d1_bookmark=bookmark-new");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure"); // https request
  });

  test("no Secure flag on an http request", () => {
    const binding = fakeBinding("bookmark-new");
    const scoped = callScoped(
      adapter,
      argsFor(binding, new Request("http://localhost:8787/"), {
        isAuthenticated: true,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  test("anonymous user does not receive a bookmark cookie", () => {
    const binding = fakeBinding("bookmark-new");
    const scoped = callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: false,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("a bookmark that fails isValidBookmark is not emitted (defense-in-depth)", () => {
    // Simulates a D1 bug / format change where getBookmark() returns a
    // value that would inject header separators into Set-Cookie.
    const binding = fakeBinding("bad;val\ndef");
    const scoped = callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: true,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("authenticated user with no new bookmark gets no Set-Cookie", () => {
    const binding = fakeBinding(null);
    const scoped = callScoped(
      adapter,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: true,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("custom bookmarkCookie name is honored", () => {
    const custom = d1({
      binding: "DB",
      session: "auto",
      bookmarkCookie: "__my_bm",
    });
    const binding = fakeBinding("bookmark-new");
    const scoped = callScoped(
      custom,
      argsFor(binding, new Request("https://cms.example/"), {
        isAuthenticated: true,
        isWrite: true,
      }),
    );
    const response = scoped.commit(new Response("ok"));
    expect(response.headers.get("set-cookie")).toContain(
      "__my_bm=bookmark-new",
    );
  });
});

describe("d1() adapter — connectRequest fallback", () => {
  test("returns null when the binding lacks withSession (older runtime)", () => {
    const adapter = d1({ binding: "DB", session: "auto" });
    // Binding exists but has no withSession (pre-Sessions-API workerd).
    const envWithoutSession = { DB: {} as unknown as D1Database };
    const fn = adapter.connectRequest;
    if (!fn) throw new Error("expected connectRequest to be defined");
    const result = fn({
      env: envWithoutSession,
      request: new Request("https://cms.example/"),
      schema: {},
      isAuthenticated: true,
      isWrite: false,
    });
    expect(result).toBeNull();
  });

  test("throws the same clear error when binding is missing from env", () => {
    const adapter = d1({ binding: "DB", session: "auto" });
    const fn = adapter.connectRequest;
    if (!fn) throw new Error("expected connectRequest to be defined");
    expect(() =>
      fn({
        env: {},
        request: new Request("https://cms.example/"),
        schema: {},
        isAuthenticated: false,
        isWrite: false,
      }),
    ).toThrow(/D1 binding "DB" missing/);
  });
});
