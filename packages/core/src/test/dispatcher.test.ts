import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { memoryKv } from "../runtime/memory-kv.js";
import { createDispatcherHarness } from "./dispatcher.js";
import { createTestDb } from "./harness.js";

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
});
