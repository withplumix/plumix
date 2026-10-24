import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext, Db } from "./app-context.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { resolveRestPrincipal } from "../rest/principal.js";
import { createTestContext } from "../test/context.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { adminUser } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { withSignal } from "./app.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

/** A context whose writes are heard by a subscriber recording its context. */
function heardContext(overrides: { readonly user?: AppContext["user"] } = {}) {
  const heard: AppContext[] = [];
  const hooks = new HookRegistry();
  hooks.addAction("settings:group_changed", (_changes, ctx) => {
    heard.push(ctx);
  });
  return { heard, ctx: createTestContext({ db, hooks, ...overrides }) };
}

// A context derived from another writes as itself, so a subscriber hears the
// signal, request and principal the writer has.
describe("ctx.settings on a derived context", () => {
  test("a scheduled task's write is heard with the task's signal", async () => {
    const { heard, ctx } = heardContext();
    const signal = new AbortController().signal;

    await withSignal(ctx, signal).settings.write("notes", { body: "A" });

    expect(heard).toHaveLength(1);
    expect(heard[0]?.signal).toBe(signal);
  });

  test("an anonymous REST principal's write is heard with no user", async () => {
    const admin = await adminUser.transient({ db }).create();
    const { heard, ctx } = heardContext({
      user: { id: admin.id, email: admin.email, role: "admin", meta: {} },
    });
    const principal = await resolveRestPrincipal(ctx);
    if (principal.kind !== "anonymous") throw new Error("expected anonymous");

    await principal.ctx.settings.write("notes", { body: "A" });

    expect(heard.map((one) => one.user)).toEqual([null]);
  });

  test("a write under a base path is heard with the request the route saw", async () => {
    const seen: string[] = [];
    const heard: string[] = [];
    const writer = definePlugin("writer", (ctx) => {
      ctx.addAction("settings:group_changed", (_changes, appCtx) => {
        heard.push(appCtx.request.url);
      });
      ctx.registerRoute({
        method: "POST",
        path: "/note",
        auth: "public",
        handler: async (request, appCtx) => {
          seen.push(appCtx.request.url);
          await appCtx.settings.write("notes", { body: "A" });
          return new Response(null, { status: 204 });
        },
      });
    });
    const h = await createDispatcherHarness({
      config: { plugins: [writer], basePath: "/cms" },
    });

    (
      await h.fetch("/cms/_plumix/writer/note", {
        method: "POST",
        withCsrfHeader: true,
      })
    ).assertStatus(204);

    expect(seen).toHaveLength(1);
    expect(heard).toEqual(seen);
  });

  test("a form post's write is heard without the ambient session it dropped", async () => {
    const heard: boolean[] = [];
    const writer = definePlugin("writer", (ctx) => {
      ctx.addAction("settings:group_changed", (_changes, appCtx) => {
        heard.push(appCtx.authenticator.hasSession?.(appCtx.request) ?? false);
      });
      ctx.registerRoute({
        method: "POST",
        path: "/note",
        auth: "public",
        formPost: true,
        handler: async (_request, appCtx) => {
          await appCtx.settings.write("notes", { body: "A" });
          return new Response(null, { status: 204 });
        },
      });
    });
    const h = await createDispatcherHarness({ config: { plugins: [writer] } });
    const admin = await h.seedUser("admin");

    (
      await h.fetch("/_plumix/writer/note", {
        method: "POST",
        as: admin,
        withCsrfHeader: false,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://cms.example",
        },
        body: "",
      })
    ).assertStatus(204);

    expect(heard).toEqual([false]);
  });
});
