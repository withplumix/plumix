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

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "cms.example", origin: "https://cms.example" },
});
const theme = defineTheme({ templates: [fallback(() => null)] });
const runtime = { name: "test", createHandler: createPlumixHandler };

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
