import { describe, expect, test } from "vitest";

import type { TelemetrySnapshot } from "../context/telemetry.js";
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
  return createPlumixHandler(app);
}

const request = () => new Request("https://cms.example/unknown");

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
    const plugin = definePlugin("echo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/whoami",
        handler: (_request, appCtx) =>
          new Response(appCtx.clientAddress ?? "none"),
      });
    });
    const handler = await handlerFor({ plugins: [plugin] });

    const response = await handler.fetch(
      new Request("https://cms.example/whoami"),
      { env: {}, clientAddress: "203.0.113.7" },
    );

    expect(await response.text()).toBe("203.0.113.7");
  });

  test("an invocation with no client address leaves ctx.clientAddress undefined, whatever the request forwards", async () => {
    const plugin = definePlugin("echo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/whoami",
        handler: (_request, appCtx) =>
          new Response(appCtx.clientAddress ?? "none"),
      });
    });
    const handler = await handlerFor({ plugins: [plugin] });

    const response = await handler.fetch(
      new Request("https://cms.example/whoami", {
        headers: {
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "198.51.100.9",
        },
      }),
      { env: {} },
    );

    expect(await response.text()).toBe("none");
  });

  test("an empty client address is an absent one, not a bucket of its own", async () => {
    const plugin = definePlugin("echo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/whoami",
        handler: (_request, appCtx) =>
          new Response(appCtx.clientAddress ?? "none"),
      });
    });
    const handler = await handlerFor({ plugins: [plugin] });

    const response = await handler.fetch(
      new Request("https://cms.example/whoami"),
      { env: {}, clientAddress: "  " },
    );

    expect(await response.text()).toBe("none");
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
