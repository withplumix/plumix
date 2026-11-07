import { describe, expect, test } from "vitest";

import { readEditLease } from "../../src/db/edit-lease.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const categories = definePlugin("categories", {
  setup: (ctx) => {
    ctx.registerTermTaxonomy("category", { label: "Categories" });
  },
});

const site = await testSite({ plugins: [categories] });

describe("leasing a term", () => {
  test("leases the term to the caller from the admin for 120 seconds", async () => {
    const editor = await site.factory.editor.create();
    const term = await site.factory.category.create();

    const lease = await site
      .actingAs(editor)
      .rpc.term.lease.acquire({ id: term.id });

    expect(lease).toMatchObject({
      holder: { id: editor.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another editor holds it, the caller is refused with who and since when", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const term = await site.factory.category.create();
    await site.actingAs(ada).rpc.term.lease.acquire({ id: term.id });

    await expect(
      site.actingAs("editor").rpc.term.lease.acquire({ id: term.id }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-10-19T12:00:00Z"),
      },
    });
  });

  test("with takeOver, the caller replaces the editor holding it", async () => {
    const ada = await site.factory.editor.create({ name: "Ada" });
    const editor = await site.factory.editor.create();
    const term = await site.factory.category.create();
    await site.actingAs(ada).rpc.term.lease.acquire({ id: term.id });

    const lease = await site
      .actingAs(editor)
      .rpc.term.lease.acquire({ id: term.id, takeOver: true });

    expect(lease.holder.id).toBe(editor.id);
  });

  test("by a caller who can't edit the term is forbidden", async () => {
    const term = await site.factory.category.create();

    await expect(
      site.actingAs("member").rpc.term.lease.acquire({ id: term.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("a missing term is not found", async () => {
    await expect(
      site.actingAs("editor").rpc.term.lease.acquire({ id: 9999 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 9999 },
    });
  });
});

describe("renewing a term lease", () => {
  test("after another editor took over, the renewal reports who and when", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.editor.create({ name: "Ada" });
    const editor = site.actingAs("editor");
    const term = await site.factory.category.create();
    await editor.rpc.term.lease.acquire({ id: term.id });
    site.travel({ minutes: 1 });
    await site
      .actingAs(ada)
      .rpc.term.lease.acquire({ id: term.id, takeOver: true });

    const renewal = await editor.rpc.term.lease.renew({ id: term.id });

    expect(renewal).toEqual({
      lost: {
        by: { id: ada.id, name: "Ada" },
        at: new Date("2026-10-19T12:01:00Z"),
      },
    });
  });
});

describe("releasing a term lease", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const editor = site.actingAs("editor");
    const term = await site.factory.category.create();
    await editor.rpc.term.lease.acquire({ id: term.id });

    await editor.rpc.term.lease.release({ id: term.id });

    expect(
      await readEditLease(
        site.context.db,
        { kind: "term", id: term.id },
        new Date("2026-10-19T12:00:30Z"),
      ),
    ).toBeUndefined();
  });
});
