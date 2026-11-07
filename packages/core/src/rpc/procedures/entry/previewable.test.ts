import { createORPCErrorConstructorMap } from "@orpc/server";
import { describe, expect, test } from "vitest";

import type { User } from "../../../db/schema/users.js";
import { withUser } from "../../../auth/with-user.js";
import { upsertAutosave } from "../../../revisions/repository.js";
import { RPC_ERRORS } from "../../../rpc-errors.js";
import { testSite } from "../../../test/site.js";
import { previewableEntry } from "./previewable.js";

const errors = createORPCErrorConstructorMap(RPC_ERRORS);

const site = await testSite({});

/** The gate as a plugin's `.use(authenticated)` handler reaches it. */
const contextOf = (user: User) => withUser(site.context, user);

describe("previewableEntry", () => {
  test("hands an editor the live row for a type it asked for", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.published.create({ authorId: editor.id });

    const row = await previewableEntry(
      contextOf(editor),
      { entryId: entry.id, entryTypes: ["post"] },
      errors,
    );

    expect(row).toMatchObject({ id: entry.id, type: "post" });
  });

  test("answers NOT_FOUND for a type outside the caller's allowlist", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.published.create({ authorId: editor.id });

    await expect(
      previewableEntry(
        contextOf(editor),
        { entryId: entry.id, entryTypes: ["page"] },
        errors,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: entry.id },
    });
  });

  test("answers NOT_FOUND for an entry that is not there", async () => {
    const editor = await site.factory.editor.create();

    await expect(
      previewableEntry(
        contextOf(editor),
        { entryId: 999_999, entryTypes: ["post"] },
        errors,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("refuses a caller who may not edit the entry", async () => {
    const member = await site.factory.member.create();
    const entry = await site.factory.published.create();

    await expect(
      previewableEntry(
        contextOf(member),
        { entryId: entry.id, entryTypes: ["post"] },
        errors,
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });

  test("refuses edit_own on someone else's entry", async () => {
    const author = await site.factory.author.create();
    const theirs = await site.factory.draft.create();

    await expect(
      previewableEntry(
        contextOf(author),
        { entryId: theirs.id, entryTypes: ["post"] },
        errors,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("allows edit_own on the caller's own entry", async () => {
    const author = await site.factory.author.create();
    const mine = await site.factory.draft.create({ authorId: author.id });

    const row = await previewableEntry(
      contextOf(author),
      { entryId: mine.id, entryTypes: ["post"] },
      errors,
    );

    expect(row).toMatchObject({ id: mine.id });
  });

  test("overlays the caller's autosave onto content, excerpt and meta, leaving title live", async () => {
    const editor = await site.factory.editor.create();
    const entry = await site.factory.published.create({
      authorId: editor.id,
      title: "Live title",
      excerpt: "Live excerpt",
    });
    await upsertAutosave(site.context.db, {
      entry,
      authorId: editor.id,
      patch: {
        title: "Drafted title",
        content: null,
        excerpt: "Drafted excerpt",
        meta: { drafted: true },
        metaDeletes: [],
      },
    });

    const row = await previewableEntry(
      contextOf(editor),
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
    const editor = await site.factory.editor.create();
    const other = await site.factory.author.create();
    const entry = await site.factory.published.create({
      authorId: other.id,
      excerpt: "Live excerpt",
    });
    await upsertAutosave(site.context.db, {
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
      contextOf(editor),
      { entryId: entry.id, entryTypes: ["post"] },
      errors,
    );

    expect(row.excerpt).toBe("Live excerpt");
  });
});
