import { beforeAll, describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { tryGetContext } from "../context/stores.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { memoryKv } from "../runtime/memory-kv.js";
import { fakeCdn } from "./cdn-fake.js";
import { createDispatcherHarness } from "./dispatcher.js";
import { createTestDb } from "./harness.js";
import { buildRequest } from "./request.js";

// The RPC handler's graph loads on the first RPC, ~800ms cold; loading it here
// keeps that out of a test, where a busy runner hit the 5s timeout.
beforeAll(async () => {
  await import("../rpc/build-handler.js");
});

describe("createDispatcherHarness db option", () => {
  test("a supplied database is the one requests run against", async () => {
    const db = await createTestDb();
    const h = await createDispatcherHarness({ db });

    const admin = await h.seedUser("admin");
    const response = await h.fetch("/_plumix/rpc/auth/session", {
      method: "POST",
      json: {},
      as: admin,
    });
    response.assertStatus(200);
    expect(h.db).toBe(db);
  });

  test("without one, each harness gets its own fresh database", async () => {
    const first = await createDispatcherHarness();
    const second = await createDispatcherHarness();
    await first.seedUser();

    expect(await second.db.query.users.findMany()).toEqual([]);
  });
});

/** A route answering who the request store holds and who the handler was given. */
const identityProbe = definePlugin("identity-probe", (ctx) => {
  ctx.registerRoute({
    method: "GET",
    path: "/identity",
    auth: "authenticated",
    handler: (_request, appCtx) =>
      Response.json({
        stored: tryGetContext() !== null,
        ambient: tryGetContext()?.user?.id ?? null,
        session: appCtx.user?.id ?? null,
      }),
  });
});

/** A route answering whether the request carries an "a" cookie and who's signed in. */
const cookieProbe = definePlugin("cookie-probe", (ctx) => {
  ctx.registerRoute({
    method: "GET",
    path: "/cookie",
    auth: "authenticated",
    handler: (request, appCtx) =>
      Response.json({
        hasA: (request.headers.get("cookie") ?? "").includes("a=b"),
        session: appCtx.user?.id ?? null,
      }),
  });
});

// The runtime builds the stored context before authentication, so a signed-in
// request is only ever signed in through its session (#2343 hid behind this).
describe("createDispatcherHarness sign-in", () => {
  test("`as` signs the request in through its session, not the request store", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [identityProbe] },
    });
    const admin = await h.seedUser("admin");

    const response = await h.fetch("/_plumix/identity-probe/identity", {
      as: admin,
    });

    expect(await response.json()).toEqual({
      stored: true,
      ambient: null,
      session: admin.id,
    });
  });

  test("authenticateRequest appends the session cookie, preserving cookies the request already carried", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [cookieProbe] },
    });
    const admin = await h.seedUser("admin");

    const bare = new Request(
      "https://cms.example/_plumix/cookie-probe/cookie",
      {
        headers: { cookie: "a=b" },
      },
    );
    const authed = await h.authenticateRequest(bare, admin.id);

    expect(authed.headers.get("cookie")).toContain("a=b");

    const response = await h.dispatch(authed);
    expect(await response.json()).toMatchObject({
      hasA: true,
      session: admin.id,
    });
  });

  test("`fetch({ as })` and `authenticateRequest` produce the same cookie-header shape for the same input", async () => {
    const h = await createDispatcherHarness({ db: await createTestDb() });
    const admin = await h.seedUser("admin");
    const cookieHeaderShape = new RegExp(`^a=b; ${SESSION_COOKIE_NAME}=.+$`);

    const viaFetch = await buildRequest(h.db, "/", {
      headers: { cookie: "a=b" },
      as: admin,
    });
    const viaAuthenticate = await h.authenticateRequest(
      new Request("https://cms.example/", { headers: { cookie: "a=b" } }),
      admin.id,
    );

    expect(viaFetch.headers.get("cookie")).toMatch(cookieHeaderShape);
    expect(viaAuthenticate.headers.get("cookie")).toMatch(cookieHeaderShape);
  });
});

/** A route answering which bound slots the request context carried. */
const slotsProbe = definePlugin("slots-probe", (ctx) => {
  ctx.registerPublicRoute({
    path: "/slots",
    handler: (_request, appCtx) =>
      Response.json({
        kv: appCtx.kv !== undefined,
        imageDelivery: appCtx.imageDelivery?.kind ?? null,
      }),
  });
});

describe("createDispatcherHarness config", () => {
  test("a handler reads the app's resolved config as ctx.config", async () => {
    const seen: AppContext[] = [];
    const configProbe = definePlugin("config-probe", (ctx) => {
      ctx.registerPublicRoute({
        path: "/config",
        handler: (_request, appCtx) => {
          seen.push(appCtx);
          return new Response(null, { status: 204 });
        },
      });
    });
    const h = await createDispatcherHarness({
      config: { plugins: [configProbe] },
    });

    await h.fetch("/config");

    expect(seen).toHaveLength(1);
    expect(seen[0]?.config).toBe(h.app.config);
  });
});

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

describe("createDispatcherHarness slot binding", () => {
  test("image delivery reaches a request connected, as the handler binds it", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [slotsProbe],
        imageDelivery: {
          kind: "unbound",
          url: (source) => source,
          connect: () => ({ kind: "bound", url: (source) => source }),
        },
      },
    });

    const response = await h.fetch("/slots");

    expect(await response.json()).toMatchObject({ imageDelivery: "bound" });
  });

  test("a kv store reaches a request as ctx.kv", async () => {
    const h = await createDispatcherHarness({
      kv: memoryKv().connect(),
      config: { plugins: [slotsProbe] },
    });

    const response = await h.fetch("/slots");

    expect(await response.json()).toMatchObject({ kv: true });
  });

  test("a cacheable public GET is stored in the cdn and the next is served from it", async () => {
    const cdn = fakeCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [blog] },
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Stored title",
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    (await h.fetch("/post/hello")).assertStatus(200);
    await h.drainDeferred();
    cdn.assertStored("/post/hello");
    // A factory write fires no hook, so nothing purges the stored page.
    await h.db.update(entries).set({ title: "Changed title" });

    const second = await h.fetch("/post/hello");
    expect(await second.text()).toContain("Stored title");
  });

  // A fake standing in for a deployed cdn has to get what a deployed one gets,
  // or a plugin test can prove what it stores and never what retires it.
  test("a cdn receives the purge an entry mutation enqueues", async () => {
    const cdn = fakeCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [blog] },
    });
    const admin = await h.seedUser("admin");
    const post = await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      status: "published",
      authorId: admin.id,
      publishedAt: new Date(),
    });
    (await h.fetch("/post/hello")).assertStatus(200);
    await h.drainDeferred();
    cdn.assertStored("/post/hello");

    const trashed = await h.fetch("/_plumix/rpc/entry/trash", {
      as: admin,
      json: { json: { id: post.id } },
    });
    trashed.assertStatus(200);
    await h.drainDeferred();

    cdn.assertNotStored("/post/hello");
  });
});

describe("createDispatcherHarness assertTemplate", () => {
  async function harnessWithPost() {
    const h = await createDispatcherHarness({ config: { plugins: [blog] } });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      parentId: null,
    });
    return h;
  }

  test("passes on the label of the rule the request rendered through", async () => {
    const h = await harnessWithPost();

    const response = await h.fetch("/post/hello");

    expect(response.assertStatus(200).assertTemplate("fallback")).toBe(
      response,
    );
  });

  test("throws naming the label the request actually rendered through", async () => {
    const h = await harnessWithPost();

    const response = await h.fetch("/post/hello");

    expect(() => response.assertTemplate("post:hello")).toThrow(
      'assertTemplate: expected "post:hello", got "fallback"',
    );
  });

  test("throws when the request rendered through no template", async () => {
    const h = await harnessWithPost();

    const response = await h.fetch("/post/missing");

    expect(() => response.assertStatus(404).assertTemplate("fallback")).toThrow(
      'assertTemplate: expected "fallback", but no template was resolved',
    );
  });
});
