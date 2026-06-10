import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { AuthenticatedRpcHarness } from "../test/rpc.js";
import { withUser } from "../context/app.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { terms } from "../db/schema/terms.js";
import {
  entryGetInputSchema,
  entryListInputSchema,
} from "../rpc/procedures/entry/schemas.js";
import { createRpcHarness } from "../test/rpc.js";
import { EntryReadError } from "./errors.js";
import { getEntry, listEntries } from "./read-service.js";

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
    const [term] = await h.context.db
      .insert(terms)
      .values({ taxonomy: "category", name: "News", slug: "news" })
      .returning();
    if (!term) throw new Error("seed: term insert returned no row");
    await h.context.db
      .insert(entryTerm)
      .values({ entryId: entry.id, termId: term.id });

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
