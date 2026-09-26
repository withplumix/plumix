import { createORPCErrorConstructorMap } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { withUser } from "../../../context/app.js";
import { upsertAutosave } from "../../../revisions/repository.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { RPC_ERRORS } from "../../errors.js";
import { previewableEntry } from "./previewable.js";

const errors = createORPCErrorConstructorMap(RPC_ERRORS);

/** The gate as a plugin's `.use(authenticated)` handler reaches it. */
async function harnessAs(role: "editor" | "contributor" | "subscriber") {
  const h = await createRpcHarness({ authAs: role });
  return { h, ctx: withUser(h.context, h.user) };
}

describe("previewableEntry", () => {
  test("hands an editor the live row for a type it asked for", async () => {
    const { h, ctx } = await harnessAs("editor");
    const entry = await h.factory.published.create({ authorId: h.user.id });

    const row = await previewableEntry(
      ctx,
      { entryId: entry.id, entryTypes: ["post"] },
      errors,
    );

    expect(row).toMatchObject({ id: entry.id, type: "post" });
  });

  test("answers NOT_FOUND for a type outside the caller's allowlist", async () => {
    const { h, ctx } = await harnessAs("editor");
    const entry = await h.factory.published.create({ authorId: h.user.id });

    await expect(
      previewableEntry(
        ctx,
        { entryId: entry.id, entryTypes: ["page"] },
        errors,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: entry.id },
    });
  });

  test("answers NOT_FOUND for an entry that is not there", async () => {
    const { ctx } = await harnessAs("editor");

    await expect(
      previewableEntry(ctx, { entryId: 999_999, entryTypes: ["post"] }, errors),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("refuses a caller who may not edit the entry", async () => {
    const { h, ctx } = await harnessAs("subscriber");
    const author = await h.factory.author.create();
    const entry = await h.factory.published.create({ authorId: author.id });

    await expect(
      previewableEntry(
        ctx,
        { entryId: entry.id, entryTypes: ["post"] },
        errors,
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("refuses edit_own on someone else's entry, and allows it on your own", async () => {
    const { h, ctx } = await harnessAs("contributor");
    const other = await h.factory.author.create();
    const theirs = await h.factory.draft.create({ authorId: other.id });
    const mine = await h.factory.draft.create({ authorId: h.user.id });

    await expect(
      previewableEntry(
        ctx,
        { entryId: theirs.id, entryTypes: ["post"] },
        errors,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(
      await previewableEntry(
        ctx,
        { entryId: mine.id, entryTypes: ["post"] },
        errors,
      ),
    ).toMatchObject({ id: mine.id });
  });

  test("overlays the caller's autosave onto content, excerpt and meta, leaving title live", async () => {
    const { h, ctx } = await harnessAs("editor");
    const entry = await h.factory.published.create({
      authorId: h.user.id,
      title: "Live title",
      excerpt: "Live excerpt",
    });
    await upsertAutosave(h.context.db, {
      entry,
      authorId: h.user.id,
      patch: {
        title: "Drafted title",
        content: null,
        excerpt: "Drafted excerpt",
        meta: { drafted: true },
        metaDeletes: [],
      },
    });

    const row = await previewableEntry(
      ctx,
      { entryId: entry.id, entryTypes: ["post"] },
      errors,
    );

    expect(row).toMatchObject({
      title: "Live title",
      excerpt: "Drafted excerpt",
    });
    expect(row.meta).toMatchObject({ drafted: true });
  });

  // The autosave is looked up per *caller*, not per entry author: an editor
  // previewing someone else's entry must see the live row, never that author's
  // unsaved draft.
  test("ignores the entry author's autosave when someone else previews", async () => {
    const { h, ctx } = await harnessAs("editor");
    const other = await h.factory.author.create();
    const entry = await h.factory.published.create({
      authorId: other.id,
      excerpt: "Live excerpt",
    });
    await upsertAutosave(h.context.db, {
      entry,
      authorId: other.id,
      patch: {
        title: entry.title,
        content: null,
        excerpt: "Their draft",
        meta: {},
        metaDeletes: [],
      },
    });

    const row = await previewableEntry(
      ctx,
      { entryId: entry.id, entryTypes: ["post"] },
      errors,
    );

    expect(row.excerpt).toBe("Live excerpt");
  });
});
