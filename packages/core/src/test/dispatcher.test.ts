import { describe, expect, test, vi } from "vitest";

import type { ConnectedCdn } from "../runtime/slots.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { entryPurgeTags } from "../cdn/tags.js";
import { tryGetContext } from "../context/stores.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { memoryKv } from "../runtime/memory-kv.js";
import { createDispatcherHarness } from "./dispatcher.js";
import { createTestDb } from "./harness.js";
import { buildRequest } from "./request.js";

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
    const h = await createDispatcherHarness({ plugins: [identityProbe] });
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
    const h = await createDispatcherHarness({ plugins: [cookieProbe] });
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

const blog = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

describe("createDispatcherHarness slot binding", () => {
  test("image delivery reaches a request connected, as the handler binds it", async () => {
    const h = await createDispatcherHarness({
      plugins: [slotsProbe],
      imageDelivery: {
        kind: "unbound",
        url: (source) => source,
        connect: () => ({ kind: "bound", url: (source) => source }),
      },
    });

    const response = await h.fetch("/slots");

    expect(await response.json()).toMatchObject({ imageDelivery: "bound" });
  });

  test("a kv store reaches a request as ctx.kv", async () => {
    const h = await createDispatcherHarness({
      plugins: [slotsProbe],
      kv: memoryKv().connect(),
    });

    const response = await h.fetch("/slots");

    expect(await response.json()).toMatchObject({ kv: true });
  });

  // A stub standing in for a deployed cdn has to get what a deployed one gets,
  // or a plugin test can prove what it stores and never what retires it.
  test("a cdn receives the purge an entry mutation enqueues", async () => {
    const purgeTags = vi.fn<NonNullable<ConnectedCdn["purgeTags"]>>(() =>
      Promise.resolve(),
    );
    const h = await createDispatcherHarness({
      plugins: [blog],
      cdn: { decorate: (response) => response, purgeTags },
    });
    const admin = await h.seedUser("admin");

    const created = await h.fetch("/_plumix/rpc/entry/create", {
      as: admin,
      json: {
        json: {
          type: "post",
          title: "Hello",
          slug: "hello",
          status: "published",
        },
        meta: [],
      },
    });
    created.assertStatus(200);
    await h.drainDeferred();

    const [entry] = await h.db.select({ id: entries.id }).from(entries);
    expect(purgeTags.mock.calls.flatMap(([tags]) => [...tags])).toEqual(
      entryPurgeTags("post", entry?.id ?? 0),
    );
  });
});
