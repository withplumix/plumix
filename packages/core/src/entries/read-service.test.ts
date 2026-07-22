import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { AuthenticatedRpcHarness } from "../test/rpc.js";
import { withUser } from "../context/app.js";
import { definePlugin } from "../plugin/define.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import {
  entryGetInputSchema,
  entryListInputSchema,
} from "../rpc/procedures/entry/schemas.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { createRpcHarness } from "../test/rpc.js";
import { createTracedContext } from "../test/traced-context.js";
import { EntryReadError } from "./errors.js";
import { getEntry, listEntries, readEntryType } from "./read-service.js";

function authedCtx(h: AuthenticatedRpcHarness): AppContext {
  return withUser(h.context, h.user, null);
}

const listInput = (partial: Record<string, unknown> = {}) =>
  v.parse(entryListInputSchema, partial);
const getInput = (partial: Record<string, unknown>) =>
  v.parse(entryGetInputSchema, partial);

describe("listEntries", () => {
  test("clamps a subscriber to published entries by default", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft" });

    const rows = await listEntries(authedCtx(h), listInput());

    expect(rows.map((r) => r.slug)).toEqual(["pub"]);
  });

  test("lets an editor filter to drafts", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "draft" });

    const rows = await listEntries(
      authedCtx(h),
      listInput({ status: "draft" }),
    );

    expect(rows.map((r) => r.slug)).toEqual(["draft"]);
  });

  test("excludes trash from an editor's default view", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
    await h.factory.entry.create({
      authorId: h.user.id,
      slug: "gone",
      status: "trash",
    });

    const rows = await listEntries(authedCtx(h), listInput());

    expect(rows.map((r) => r.slug)).toEqual(["pub"]);
  });

  test("silently clamps — a subscriber asking for drafts gets an empty list", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await h.factory.draft.create({ authorId: h.user.id, slug: "secret" });

    const rows = await listEntries(
      authedCtx(h),
      listInput({ status: "draft" }),
    );

    expect(rows).toEqual([]);
  });

  test("narrows by free-text search across title", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "a",
      title: "Hello world",
    });
    await h.factory.published.create({
      authorId: h.user.id,
      slug: "b",
      title: "Something else",
    });

    const rows = await listEntries(
      authedCtx(h),
      listInput({ search: "hello" }),
    );

    expect(rows.map((r) => r.slug)).toEqual(["a"]);
  });

  test("paginates with limit + offset on a stable order", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    for (const slug of ["a", "b", "c"]) {
      await h.factory.published.create({ authorId: h.user.id, slug });
    }

    const page = await listEntries(
      authedCtx(h),
      listInput({ orderBy: "title", order: "asc", limit: 1, offset: 1 }),
    );

    expect(page).toHaveLength(1);
  });

  test("throws forbidden when the caller can't read the type", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });

    const error = await listEntries(
      authedCtx(h),
      listInput({ type: "secret" }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EntryReadError);
    expect(error).toMatchObject({
      data: { code: "forbidden", capability: "entry:secret:read" },
    });
  });

  test("throws reserved_type for revision/autosave rows", async () => {
    const h = await createRpcHarness({ authAs: "editor" });

    const error = await listEntries(
      authedCtx(h),
      listInput({ type: "revision" }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EntryReadError);
    expect(error).toMatchObject({ data: { code: "reserved_type" } });
  });
});

describe("getEntry", () => {
  test("returns a published entry hydrated with meta + terms", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const entry = await h.factory.published.create({
      authorId: h.user.id,
      slug: "pub",
    });
    const term = await h.factory.term.create({
      name: "News",
      slug: "news",
    });
    await h.factory.entryTerm.create({ entryId: entry.id, termId: term.id });

    const result = await getEntry(authedCtx(h), getInput({ id: entry.id }));

    expect(result.slug).toBe("pub");
    expect(result.meta).toEqual({});
    expect(result.terms).toEqual({ category: [term.id] });
  });

  test("throws not_found for a missing id", async () => {
    const h = await createRpcHarness({ authAs: "editor" });

    const error = await getEntry(authedCtx(h), getInput({ id: 9999 })).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(EntryReadError);
    expect(error).toMatchObject({ data: { code: "not_found", entryId: 9999 } });
  });

  test("hides a draft from a subscriber as not_found, not forbidden", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "secret",
    });

    const error = await getEntry(
      authedCtx(h),
      getInput({ id: draft.id }),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ data: { code: "not_found" } });
  });

  test("lets an editor read any draft", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "wip",
    });

    const result = await getEntry(authedCtx(h), getInput({ id: draft.id }));

    expect(result.slug).toBe("wip");
  });

  test("lets an author read their own draft but hides others'", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const other = await h.factory.user.create({ role: "author" });
    const mine = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "mine",
    });
    const theirs = await h.factory.draft.create({
      authorId: other.id,
      slug: "theirs",
    });

    const ctx = authedCtx(h);
    await expect(
      getEntry(ctx, getInput({ id: mine.id })),
    ).resolves.toMatchObject({ slug: "mine" });
    await expect(
      getEntry(ctx, getInput({ id: theirs.id })),
    ).rejects.toMatchObject({ data: { code: "not_found" } });
  });
});

describe("readEntryType", () => {
  test("repeated reads of the same entry run one query per request", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext();
    const author = await harness.factory.user.create({});
    const post = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
    });

    const [first, second] = await run(async () => [
      await readEntryType(ctx, post.id),
      await readEntryType(ctx, post.id),
    ]);

    expect(first).toBe("post");
    expect(second).toBe("post");
    expect(dbQueryCount()).toBe(1);
  });

  test("a missing entry reads as null and is memoized too", async () => {
    const { ctx, run, dbQueryCount } = await createTracedContext();

    const [first, second] = await run(async () => [
      await readEntryType(ctx, 999),
      await readEntryType(ctx, 999),
    ]);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(dbQueryCount()).toBe(1);
  });
});

// Reference meta hydration in the shared read pipeline (#1507): admin
// oRPC reads and REST projection both ride these two functions, so
// hydrated values asserted here cover both surfaces' data.
describe("reference meta hydration", () => {
  // Raw field defs (not the flat factories) keep both fields'
  // `referenceTarget.scope` undefined → one `(kind, scope)` group.
  const OWNER_FIELD = {
    key: "owner",
    label: "Owner",
    inputType: "user",
    type: "string",
    referenceTarget: { kind: "user" },
  } as const;
  const REVIEWERS_FIELD = {
    key: "reviewers",
    label: "Reviewers",
    inputType: "userList",
    type: "json",
    referenceTarget: { kind: "user", multiple: true },
  } as const;

  function registryWithUserRefs() {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    registry.entryMetaBoxes.set("relations", {
      id: "relations",
      label: "Relations",
      entryTypes: ["post"],
      fields: [OWNER_FIELD, REVIEWERS_FIELD],
      registeredBy: null,
    });
    return registry;
  }

  test("getEntry hydrates reference meta into the adapter's summary shape", async () => {
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: registryWithUserRefs(),
    });
    const owner = await h.factory.user.create({ name: "Owner One" });
    const e = await h.factory.published.create({
      authorId: h.user.id,
      meta: { owner: String(owner.id), reviewers: [String(owner.id)] },
    });

    const read = await getEntry(authedCtx(h), getInput({ id: e.id }));

    expect(read.meta.owner).toEqual({
      id: String(owner.id),
      name: "Owner One",
      slug: owner.slug,
      avatarUrl: null,
    });
    expect(read.meta.reviewers).toEqual([read.meta.owner]);
  });

  test("getEntry reads a deleted referenced entity as absent", async () => {
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: registryWithUserRefs(),
    });
    const e = await h.factory.published.create({
      authorId: h.user.id,
      meta: { owner: "999999", reviewers: ["999999"] },
    });

    const read = await getEntry(authedCtx(h), getInput({ id: e.id }));

    expect(read.meta.owner).toBeNull();
    expect(read.meta.reviewers).toEqual([]);
  });

  test("listEntries hydrates the page with one in-query per (kind, scope) group", async () => {
    const refsPlugin = definePlugin("test-refs", (ctx) => {
      ctx.registerEntryMetaBox("relations", {
        label: "Relations",
        entryTypes: ["post"],
        fields: [OWNER_FIELD, REVIEWERS_FIELD],
      });
    });
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [refsPlugin],
    });
    const users = await Promise.all(
      Array.from({ length: 3 }, () => harness.factory.user.create({})),
    );
    for (const [i, owner] of users.entries()) {
      await harness.factory.entry.create({
        authorId: owner.id,
        type: "post",
        status: "published",
        slug: `post-${String(i)}`,
        meta: {
          owner: String(owner.id),
          reviewers: users.map((u) => String(u.id)),
        },
      });
    }

    const admin = await harness.factory.user.create({ role: "admin" });
    const rows = await run(() =>
      listEntries(withUser(ctx, admin), listInput()),
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const meta = row.meta as {
        owner: { id: string } | null;
        reviewers: readonly { id: string }[];
      };
      expect(meta.owner?.id).toBeDefined();
      expect(meta.reviewers.map((u) => u.id)).toEqual(
        users.map((u) => String(u.id)),
      );
    }
    // One SELECT for the page + one aggregated user in-query for every
    // reference field of every entry in the response — never per-row.
    expect(dbQueryCount()).toBe(2);
  });
});
