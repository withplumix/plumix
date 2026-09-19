import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { settings } from "../../../db/schema/settings.js";
import { terms } from "../../../db/schema/terms.js";
import { users } from "../../../db/schema/users.js";
import { definePlugin } from "../../../plugin/define.js";
import { number, toggle } from "../../../plugin/fields/index.js";
import { AUTOSAVE_TYPE } from "../../../revisions/slug-codec.js";
import { createTracedContext } from "../../../test/traced-context.js";
import { sweepUnsettledMeta } from "./sweep.js";

// One field of each scalar shape per store, so every store has a value the
// write path would settle and one it could not.
const plugin = definePlugin("test-sweep", (ctx) => {
  ctx.registerEntryMetaBox("entry-box", {
    label: "Entry",
    entryTypes: ["post"],
    fields: [toggle("sealed"), number("clearance")],
  });
  ctx.registerTermTaxonomy("topic", { label: "Topics", entryTypes: ["post"] });
  ctx.registerTermMetaBox("term-box", {
    label: "Term",
    termTaxonomies: ["topic"],
    fields: [number("weight")],
  });
  ctx.registerUserMetaBox("user-box", {
    label: "User",
    fields: [toggle("newsletter")],
  });
  ctx.registerSettingsGroup("reading", {
    label: "Reading",
    fields: [number("perPage")],
  });
});

async function seeded() {
  const { harness, ctx, run, dbQueryCount } = await createTracedContext({
    plugins: [plugin, manySettings],
  });
  const author = await harness.factory.user.create({
    meta: { newsletter: "true" },
  });
  const post = await harness.factory.entry.create({
    authorId: author.id,
    type: "post",
    status: "published",
    meta: { sealed: 1, clearance: "nope", ghost: 42 },
  });
  const term = await harness.factory.term.create({
    taxonomy: "topic",
    meta: { weight: "3" },
  });
  await harness.db
    .insert(settings)
    .values({ group: "reading", key: "perPage", value: "10" });
  return { harness, ctx, run, dbQueryCount, author, post, term };
}

// Enough settleable settings that a call's budget runs out partway through
// them, so the settings walk has to resume.
const MANY = Array.from(
  { length: 30 },
  (_, i) => `n${String(i).padStart(2, "0")}`,
);
const manySettings = definePlugin("test-many-settings", (ctx) => {
  ctx.registerSettingsGroup("many", {
    label: "Many",
    fields: MANY.map((key) => number(key)),
  });
});

async function storedMeta<T extends { meta: unknown }>(
  rows: Promise<T | undefined>,
): Promise<unknown> {
  return (await rows)?.meta;
}

describe("sweepUnsettledMeta", () => {
  test("reports settleable and unconvertible values per store, scope and key", async () => {
    const { ctx, post } = await seeded();

    const sweep = await sweepUnsettledMeta(ctx, { write: false });

    expect(sweep.keys).toEqual([
      {
        store: "entry",
        scope: "post",
        key: "clearance",
        settleable: 0,
        unconvertible: 1,
        unconvertibleIds: [post.id],
      },
      {
        store: "entry",
        scope: "post",
        key: "sealed",
        settleable: 1,
        unconvertible: 0,
        unconvertibleIds: [],
      },
      {
        store: "term",
        scope: "topic",
        key: "weight",
        settleable: 1,
        unconvertible: 0,
        unconvertibleIds: [],
      },
      {
        store: "user",
        scope: null,
        key: "newsletter",
        settleable: 1,
        unconvertible: 0,
        unconvertibleIds: [],
      },
      {
        store: "settings",
        scope: "reading",
        key: "perPage",
        settleable: 1,
        unconvertible: 0,
        unconvertibleIds: [],
      },
    ]);
    expect(sweep.settled).toBe(0);
    expect(sweep.next).toBeNull();
  });

  test("reporting writes nothing", async () => {
    const { harness, ctx, post } = await seeded();

    await sweepUnsettledMeta(ctx, { write: false });

    expect(
      await storedMeta(
        harness.db.query.entries.findFirst({ where: eq(entries.id, post.id) }),
      ),
    ).toEqual({ sealed: 1, clearance: "nope", ghost: 42 });
  });

  test("settling converts every store, leaving what it could not settle and every unowned key", async () => {
    const { harness, ctx, author, post, term } = await seeded();

    const sweep = await sweepUnsettledMeta(ctx, { write: true });

    expect(sweep.settled).toBe(4);
    expect(
      await storedMeta(
        harness.db.query.entries.findFirst({ where: eq(entries.id, post.id) }),
      ),
    ).toEqual({ sealed: true, clearance: "nope", ghost: 42 });
    expect(
      await storedMeta(
        harness.db.query.terms.findFirst({ where: eq(terms.id, term.id) }),
      ),
    ).toEqual({ weight: 3 });
    expect(
      await storedMeta(
        harness.db.query.users.findFirst({ where: eq(users.id, author.id) }),
      ),
    ).toEqual({ newsletter: true });
    const [setting] = await harness.db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "perPage"));
    expect(setting?.value).toBe(10);
  });

  test("a second run finds only what it could not settle", async () => {
    const { ctx, post } = await seeded();
    await sweepUnsettledMeta(ctx, { write: true });

    const again = await sweepUnsettledMeta(ctx, { write: true });

    expect(again.settled).toBe(0);
    expect(again.keys).toEqual([
      {
        store: "entry",
        scope: "post",
        key: "clearance",
        settleable: 0,
        unconvertible: 1,
        unconvertibleIds: [post.id],
      },
    ]);
  });

  // A normalization, not an edit: nothing floats to the top of "recently
  // updated" for having been settled.
  test("settling leaves a row's last-edit time alone", async () => {
    const { harness, ctx, post } = await seeded();

    await sweepUnsettledMeta(ctx, { write: true });

    const after = await harness.db.query.entries.findFirst({
      where: eq(entries.id, post.id),
    });
    expect(after?.updatedAt).toEqual(post.updatedAt);
  });

  // An autosave is the author's edits, settled when publish promotes it; a
  // revision is history. Neither is live content for the sweep to rewrite.
  test("skips autosave and revision rows", async () => {
    const { harness, ctx, author } = await seeded();
    await harness.factory.entry.create({
      authorId: author.id,
      type: AUTOSAVE_TYPE,
      meta: { sealed: 1 },
    });

    const sweep = await sweepUnsettledMeta(ctx, { write: false });

    expect(
      sweep.keys.find((key) => key.store === "entry" && key.key === "sealed")
        ?.settleable,
    ).toBe(1);
  });

  test("announces each settled entry, so the CDN drops its render", async () => {
    const { harness, ctx, post } = await seeded();
    const announced = harness.spyAction("entry:meta_changed");

    await sweepUnsettledMeta(ctx, { write: true });

    announced
      .assertCalledOnce()
      .assertCalledWith((entry) => entry.id === post.id);
  });
  // D1 caps the queries one Worker invocation may make, so a large site can't
  // be settled in one call. A call stops at its budget and hands back where it
  // stopped; calling again from there finishes the job.
  test("stops at its query budget and resumes from where it stopped", async () => {
    const { harness, ctx, author } = await seeded();
    await harness.factory.entry.createList(40, {
      authorId: author.id,
      type: "post",
      status: "published",
      meta: { sealed: 1 },
    });

    const first = await sweepUnsettledMeta(ctx, { write: true });
    expect(first.next).toMatchObject({ store: "entry" });
    expect(first.settled).toBeLessThan(41);

    let settled = first.settled;
    let next = first.next;
    // Bounded, so a sweep that never reports done fails rather than hangs.
    for (let calls = 0; next !== null; calls += 1) {
      expect(calls).toBeLessThan(20);
      const more = await sweepUnsettledMeta(ctx, { write: true, cursor: next });
      settled += more.settled;
      next = more.next;
    }
    // 41 posts, a term, a user and a setting.
    expect(settled).toBe(44);
    const again = await sweepUnsettledMeta(ctx, { write: false });
    expect(again.keys.filter((key) => key.settleable > 0)).toEqual([]);
  });
  // The whole point of the budget: a call on the admin's button must stay
  // under what one D1-backed Worker invocation may do.
  test("a call makes no more queries than its budget", async () => {
    const { harness, ctx, run, dbQueryCount, author } = await seeded();
    await harness.factory.entry.createList(40, {
      authorId: author.id,
      type: "post",
      status: "published",
      meta: { sealed: 1 },
    });

    const before = dbQueryCount();
    await run(() => sweepUnsettledMeta(ctx, { write: true }));

    expect(dbQueryCount() - before).toBeLessThanOrEqual(25);
  });

  // Settings are resumed by key, not by position: a settings save landing
  // between two calls can remove a row the walk already passed, and a
  // position would then skip the row after it.
  test("resumes settings by key when a row it passed is removed between calls", async () => {
    const { harness, ctx } = await seeded();
    await harness.db
      .insert(settings)
      .values(MANY.map((key) => ({ group: "many", key, value: "1" })));

    let next = (await sweepUnsettledMeta(ctx, { write: true })).next;
    for (
      let calls = 0;
      next !== null && next.store !== "settings";
      calls += 1
    ) {
      expect(calls).toBeLessThan(20);
      next = (await sweepUnsettledMeta(ctx, { write: true, cursor: next }))
        .next;
    }
    // Stopped partway through settings. Remove a row it already settled.
    expect(next).not.toBeNull();
    await harness.db.delete(settings).where(eq(settings.key, "n00"));
    for (let calls = 0; next !== null; calls += 1) {
      expect(calls).toBeLessThan(20);
      next = (await sweepUnsettledMeta(ctx, { write: true, cursor: next }))
        .next;
    }

    const left = await sweepUnsettledMeta(ctx, { write: false });
    expect(left.keys.filter((key) => key.settleable > 0)).toEqual([]);
  });
});
