import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginDescriptor } from "plumix";
import {
  auth as authConfig,
  buildApp,
  definePlugin,
  defineTheme,
  fallback,
  plumix,
} from "plumix";
import * as schema from "plumix/schema";
import { applyTestSchema } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { node } from "./adapter.js";
import { nodeSqlite } from "./node-sqlite.js";

const SHELL = "<!doctype html><title>admin</title>";

const auth = authConfig({
  passkey: {
    rpName: "Plumix Test",
    rpId: "cms.example",
    origin: "https://cms.example",
  },
});

const theme = defineTheme({ templates: [fallback(() => null)] });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-adapter-"));
  mkdirSync(join(dir, "client/_plumix/admin"), { recursive: true });
  writeFileSync(join(dir, "client/_plumix/admin/index.html"), SHELL);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Build app → `createHandler` → `fetch(request, invocation)`: the seam every
// runtime adapter conforms to, over a real node:sqlite file the app's own
// `connect` opens a second time.
async function handlerFor(plugins: PluginDescriptor[] = []) {
  const database = nodeSqlite({ path: join(dir, "site.sqlite") });
  await applyTestSchema(
    database.connect({}, new Request("https://cms.example/"), schema).db,
    schema,
  );
  const app = await buildApp(
    plumix({ runtime: node(), database, auth, theme, plugins }),
  );
  return node().createHandler(app);
}

const env = () => ({ PLUMIX_ASSETS_DIR: join(dir, "client") });

describe("node adapter — createHandler().fetch", () => {
  test("renders the public route through the dispatcher", async () => {
    const handler = await handlerFor();
    const response = await handler.fetch(new Request("https://cms.example/"), {
      env: env(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  test("resolves an admin deep link through the assets binding", async () => {
    const handler = await handlerFor();
    const response = await handler.fetch(
      new Request("https://cms.example/_plumix/admin/entries/new"),
      { env: env() },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SHELL);
  });

  test("without an assets directory the admin is not available", async () => {
    const handler = await handlerFor();
    const response = await handler.fetch(
      new Request("https://cms.example/_plumix/admin"),
      { env: {} },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("admin-not-available");
  });

  test("dispose() drains the deferred work no waitUntil took", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deferring = definePlugin("deferring", (ctx) => {
      ctx.registerPublicRoute({
        path: "/defer",
        handler: (_request, appCtx) => {
          appCtx.defer(gate);
          return new Response("deferred");
        },
      });
    });
    const handler = await handlerFor([deferring]);
    await handler.fetch(new Request("https://cms.example/defer"), {
      env: env(),
    });

    let drained = false;
    const drain = handler.dispose?.().then((result) => {
      drained = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drained).toBe(false);
    release();
    expect(await drain).toEqual({ abandoned: 0 });
  });

  test("hands the invocation's client address to the request context", async () => {
    const echo = definePlugin("echo", (ctx) => {
      ctx.registerPublicRoute({
        path: "/whoami",
        handler: (_request, appCtx) =>
          new Response(appCtx.clientAddress ?? "none"),
      });
    });
    const handler = await handlerFor([echo]);
    const response = await handler.fetch(
      new Request("https://cms.example/whoami"),
      { env: env(), clientAddress: "203.0.113.7" },
    );
    expect(await response.text()).toBe("203.0.113.7");
  });
});
