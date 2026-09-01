import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { adminEntryScope } from "./admin-entry-scope.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: TestDb;
let mine: number;
let theirs: number;

beforeEach(async () => {
  db = await createTestDb();
  const factory = factoriesFor(db);
  mine = (await factory.admin.create()).id;
  theirs = (await factory.user.create({ email: "other@example.com" })).id;
});

/** A caller holding exactly `capabilities` over a site with two types. */
function contextFor(capabilities: readonly string[]): AppContext {
  const plugins = createPluginRegistry();
  for (const type of ["post", "ledger"]) {
    plugins.entryTypes.set(type, {
      name: type,
      registeredBy: "test",
      label: type,
    });
  }
  return {
    ...createTestContext({ db, plugins }),
    user: { id: mine },
    auth: { can: (capability: string) => capabilities.includes(capability) },
  } as unknown as AppContext;
}

/** Seed one entry and answer with the title, for asserting on titles. */
async function seed(
  status: "published" | "draft" | "trash",
  authorId: number,
  title: string,
): Promise<string> {
  await factoriesFor(db).entry.create({
    authorId,
    status,
    title,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    publishedAt: status === "published" ? new Date() : null,
  });
  return title;
}

/** What this caller may be shown, by title. */
async function shown(ctx: AppContext): Promise<string[]> {
  const scope = adminEntryScope(ctx);
  if (scope === null) return [];
  const rows = await db
    .select({ title: entries.title })
    .from(entries)
    .where(scope.visible)
    .orderBy(asc(entries.id));
  return rows.map((row) => row.title);
}

describe("adminEntryScope", () => {
  test("is null when the caller may read no type at all", () => {
    expect(adminEntryScope(contextFor([]))).toBeNull();
  });

  test("a reader sees published entries and no unpublished one", async () => {
    const live = await seed("published", theirs, "Live");
    await seed("draft", mine, "My draft");
    await seed("trash", theirs, "Binned");

    expect(await shown(contextFor(["entry:post:read"]))).toEqual([live]);
  });

  test("edit_own adds the caller's own drafts and nobody else's", async () => {
    const live = await seed("published", theirs, "Live");
    const own = await seed("draft", mine, "My draft");
    await seed("draft", theirs, "Their draft");
    await seed("trash", mine, "My binned");

    const ctx = contextFor(["entry:post:read", "entry:post:edit_own"]);

    expect(await shown(ctx)).toEqual([live, own]);
  });

  test("edit_any adds everyone's, still without the bin", async () => {
    const live = await seed("published", theirs, "Live");
    const own = await seed("draft", mine, "My draft");
    const other = await seed("draft", theirs, "Their draft");
    await seed("trash", theirs, "Binned");

    const ctx = contextFor(["entry:post:read", "entry:post:edit_any"]);

    expect(await shown(ctx)).toEqual([live, own, other]);
  });

  test("only readable types are in scope", async () => {
    const post = await seed("published", mine, "A post");
    await factoriesFor(db).entry.create({
      authorId: mine,
      type: "ledger",
      status: "published",
      title: "A ledger",
      slug: "a-ledger",
      publishedAt: new Date(),
    });

    expect(await shown(contextFor(["entry:post:read"]))).toEqual([post]);
  });

  test("the edit reach drops a type the caller may only read", () => {
    const ctx = contextFor([
      "entry:post:read",
      "entry:ledger:read",
      "entry:ledger:edit_own",
    ]);

    const scope = adminEntryScope(ctx, { reach: "edit" });

    expect(scope?.groups.map((group) => group.key)).toEqual(["entry:ledger"]);
  });

  test("the edit reach is null for a caller who may only read", () => {
    const ctx = contextFor(["entry:post:read", "entry:ledger:read"]);

    expect(adminEntryScope(ctx, { reach: "edit" })).toBeNull();
  });

  test("a group sits in the same place at either reach", () => {
    const ctx = contextFor([
      "entry:post:read",
      "entry:ledger:read",
      "entry:ledger:edit_any",
    ]);

    const read = adminEntryScope(ctx);
    const edit = adminEntryScope(ctx, { reach: "edit" });

    expect(edit?.groups[0]?.priority).toBe(
      read?.groups.find((group) => group.key === "entry:ledger")?.priority,
    );
  });
});
