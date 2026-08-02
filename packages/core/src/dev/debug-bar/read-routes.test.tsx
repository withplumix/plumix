import { afterEach, describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { DebugHistoryEntry } from "./history.js";
import type { DebugSnapshot } from "./snapshot.js";
import { HookRegistry } from "../../hooks/registry.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { registerCoreDebugPanels } from "./core-panels.js";
import { createDebugHistoryStore } from "./history.js";
import { handleDebugRequests } from "./read-routes.js";
import { DEBUG_REQUESTS_PATH, isDebugRequestsPath } from "./requests-path.js";

function snapshotWith(overrides: Partial<DebugSnapshot["context"]> = {}) {
  return {
    context: {
      method: "GET",
      path: "/blog/hello",
      origin: "https://cms.example",
      basePath: "",
      resolvedEntity: null,
      user: null,
      tokenScopes: null,
      siteName: null,
      locale: { code: "en", direction: "ltr" },
      slots: { cache: false, storage: false, mailer: false, images: false },
      plugins: { ids: [], entryTypes: [], termTaxonomies: [] },
      ...overrides,
    },
    spans: [],
    records: {},
  } satisfies DebugSnapshot;
}

function entry(overrides: Partial<DebugHistoryEntry> = {}): DebugHistoryEntry {
  return {
    id: "req-1",
    startedAt: 1_000,
    status: 200,
    durationMs: 5,
    snapshot: snapshotWith(),
    ...overrides,
  };
}

function ctxFor(path: string): AppContext {
  const hooks = new HookRegistry();
  registerCoreDebugPanels(hooks);
  return {
    hooks,
    request: new Request(`https://cms.example${path}`),
    debugBar: true,
  } as unknown as AppContext;
}

describe("isDebugRequestsPath", () => {
  test("matches the collection and any detail path", () => {
    expect(isDebugRequestsPath(DEBUG_REQUESTS_PATH)).toBe(true);
    expect(isDebugRequestsPath(`${DEBUG_REQUESTS_PATH}/req-1`)).toBe(true);
  });

  test("does not match a sibling path", () => {
    expect(isDebugRequestsPath("/_plumix/debug/requestsx")).toBe(false);
    expect(isDebugRequestsPath("/_plumix/rpc/entry/list")).toBe(false);
  });
});

describe("handleDebugRequests", () => {
  test("lists captured requests newest-first as bounded metadata", async () => {
    const store = createDebugHistoryStore();
    store.save(entry({ id: "old", startedAt: 1, status: 404 }));
    store.save(
      entry({
        id: "new",
        startedAt: 2,
        status: 500,
        durationMs: 9,
        snapshot: snapshotWith({ method: "POST", path: "/x" }),
      }),
    );

    const res = handleDebugRequests(ctxFor(DEBUG_REQUESTS_PATH), store);
    const body = (await res.json()) as unknown[];

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual([
      {
        id: "new",
        method: "POST",
        path: "/x",
        status: 500,
        durationMs: 9,
        timestamp: 2,
      },
      {
        id: "old",
        method: "GET",
        path: "/blog/hello",
        status: 404,
        durationMs: 5,
        timestamp: 1,
      },
    ]);
  });

  test("returns the DebugSnapshot JSON for a captured request", async () => {
    const store = createDebugHistoryStore();
    store.save(entry({ id: "req-1" }));

    const res = handleDebugRequests(
      ctxFor(`${DEBUG_REQUESTS_PATH}/req-1`),
      store,
    );
    const body = (await res.json()) as DebugSnapshot;

    expect(res.status).toBe(200);
    expect(body.context.path).toBe("/blog/hello");
    expect(body).toHaveProperty("spans");
    expect(body).toHaveProperty("records");
  });

  test("renders panel HTML for the ?format=html variant", async () => {
    const store = createDebugHistoryStore();
    store.save(entry({ id: "req-1" }));

    const res = handleDebugRequests(
      ctxFor(`${DEBUG_REQUESTS_PATH}/req-1?format=html`),
      store,
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    // The same panes the inline bar renders, keyed by panel id.
    expect(html).toContain('data-testid="plumix-debug-panel-request"');
  });

  test("404s an unknown request id", () => {
    const res = handleDebugRequests(
      ctxFor(`${DEBUG_REQUESTS_PATH}/nope`),
      createDebugHistoryStore(),
    );

    expect(res.status).toBe(404);
  });

  test("405s a non-GET method", () => {
    const store = createDebugHistoryStore();
    const res = handleDebugRequests(
      {
        hooks: new HookRegistry(),
        request: new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`, {
          method: "POST",
        }),
        debugBar: true,
      } as unknown as AppContext,
      store,
    );

    expect(res.status).toBe(405);
  });
});

// Drives real requests through the dispatcher and reads them back over the
// route, exercising the whole capture → list → get → render path. Toggles the
// `PLUMIX_DEV` gate directly (a Vite build makes it empty and tree-shakes the
// route); mirrors the dev/prod split of the injection test.
describe("debug read routes through the dispatcher", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test("lists, gets, and renders a driven request end-to-end in dev", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness();

    // Drive a request; the history writer captures it after the response.
    await h.dispatch(new Request("https://cms.example/no-such-page"));
    await h.drainDeferred();

    const listRes = await h.dispatch(
      new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`),
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as DebugRequestListShape[];
    // Newest-first: the just-driven request leads the list.
    const newest = list[0];
    expect(newest).toMatchObject({
      method: "GET",
      path: "/no-such-page",
      status: 404,
    });
    expect(typeof newest?.id).toBe("string");
    expect(typeof newest?.durationMs).toBe("number");
    expect(typeof newest?.timestamp).toBe("number");

    const getRes = await h.dispatch(
      new Request(`https://cms.example${DEBUG_REQUESTS_PATH}/${newest?.id}`),
    );
    expect(getRes.status).toBe(200);
    const snapshot = (await getRes.json()) as DebugSnapshot;
    expect(snapshot.context.path).toBe("/no-such-page");
    expect(snapshot).toHaveProperty("spans");

    const htmlRes = await h.dispatch(
      new Request(
        `https://cms.example${DEBUG_REQUESTS_PATH}/${newest?.id}?format=html`,
      ),
    );
    expect(htmlRes.headers.get("content-type")).toContain("text/html");
    expect(await htmlRes.text()).toContain(
      'data-testid="plumix-debug-panel-request"',
    );
  });

  test("does not capture requests to the read endpoint itself", async () => {
    process.env.PLUMIX_DEV = "1";
    const h = await createDispatcherHarness();

    // Hit the read route, let capture run, then list — the read request
    // itself must never show up as a captured entry.
    await h.dispatch(new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`));
    await h.drainDeferred();
    const res = await h.dispatch(
      new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`),
    );
    const list = (await res.json()) as DebugRequestListShape[];

    expect(
      list.every((item) => !item.path.startsWith(DEBUG_REQUESTS_PATH)),
    ).toBe(true);
  });

  test("has no route and captures nothing when the dev flag is unset", async () => {
    delete process.env.PLUMIX_DEV;
    const h = await createDispatcherHarness();

    // Drive a request first: with the gate off no consumer samples it, so
    // nothing is captured and the route below is a plain plumix 404.
    await h.dispatch(new Request("https://cms.example/no-such-page"));
    await h.drainDeferred();

    const res = await h.dispatch(
      new Request(`https://cms.example${DEBUG_REQUESTS_PATH}`),
    );
    expect(res.status).toBe(404);
  });
});

interface DebugRequestListShape {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly timestamp: number;
}
