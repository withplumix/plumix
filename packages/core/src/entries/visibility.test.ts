import { beforeAll, describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { Entry } from "../db/schema/entries.js";
import type { PluginRegistry } from "../plugin/registry.js";
import type { EntryViewer } from "./visibility.js";
import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { pooledEntryTypeRegistry } from "../test/pooled-entry-types.js";
import {
  canReadEntry,
  readableEntryRows,
  referenceableEntryRows,
} from "./visibility.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: TestDb;
let caller: AuthenticatedUser;
let rows: Entry[];

// Every status by both the caller and a stranger, so each arm of the rule
// has a row that only it admits. Read-only, so seeded once.
beforeAll(async () => {
  db = await createTestDb();
  const factory = factoriesFor(db);
  caller = await factory.admin.create();
  const other = await factory.user.create({ email: "other@example.com" });
  rows = [];
  for (const [who, authorId] of [
    ["mine", caller.id],
    ["theirs", other.id],
  ] as const) {
    for (const status of [
      "published",
      "draft",
      "scheduled",
      "trash",
    ] as const) {
      rows.push(
        await factory.entry.create({
          authorId,
          status,
          slug: `${status}-${who}`,
          publishedAt: status === "published" ? new Date() : null,
        }),
      );
    }
  }
});

function viewer(
  capabilities: readonly string[],
  user: AuthenticatedUser | null = caller,
): EntryViewer {
  return {
    user,
    auth: { can: (capability: string) => capabilities.includes(capability) },
    plugins: createPluginRegistry(),
  };
}

async function selected(ctx: EntryViewer): Promise<string[]> {
  const clause = readableEntryRows(ctx, "post");
  if (clause === null) return [];
  return slugsWhere(clause);
}

async function selectedReferenceable(ctx: EntryViewer): Promise<string[]> {
  return slugsWhere(referenceableEntryRows(ctx, "post"));
}

async function slugsWhere(clause: SQL): Promise<string[]> {
  const found = await db
    .select({ slug: entries.slug })
    .from(entries)
    .where(clause)
    .orderBy(asc(entries.id));
  return found.map((row) => row.slug);
}

const PUBLISHED = ["published-mine", "published-theirs"];

// Each tier with the rows it is owed, so the SQL and the predicate are each
// held to the rule and not only to each other.
const TIERS = {
  nothing: { capabilities: [], sees: [] },
  reader: { capabilities: ["entry:post:read"], sees: PUBLISHED },
  "edit_own without read": { capabilities: ["entry:post:edit_own"], sees: [] },
  contributor: {
    capabilities: ["entry:post:read", "entry:post:edit_own"],
    sees: [
      "published-mine",
      "draft-mine",
      "scheduled-mine",
      "trash-mine",
      "published-theirs",
    ],
  },
  editor: {
    capabilities: ["entry:post:read", "entry:post:edit_any"],
    sees: [
      "published-mine",
      "draft-mine",
      "scheduled-mine",
      "trash-mine",
      "published-theirs",
      "draft-theirs",
      "scheduled-theirs",
      "trash-theirs",
    ],
  },
} satisfies Record<
  string,
  { capabilities: readonly string[]; sees: readonly string[] }
>;

describe("readableEntryRows", () => {
  for (const [tier, { capabilities, sees }] of Object.entries(TIERS)) {
    test(`selects the rows canReadEntry admits for a ${tier}`, async () => {
      const ctx = viewer(capabilities);

      const byPredicate = rows
        .filter((row) => canReadEntry(ctx, row))
        .map((row) => row.slug);

      expect(byPredicate).toEqual(sees);
      expect(await selected(ctx)).toEqual(sees);
    });
  }

  test("matches referenceableEntryRows wherever the caller holds read", async () => {
    // The two are one rule under two compositions — `read` is the only thing
    // `readableEntryRows` asks on top, so a tier that holds it must not be
    // able to tell them apart. A tier that does not is where they are meant
    // to differ, and is skipped rather than asserted.
    for (const [tier, { capabilities }] of Object.entries(TIERS)) {
      const ctx = viewer(capabilities);
      if (readableEntryRows(ctx, "post") === null) continue;
      expect(await selectedReferenceable(ctx), tier).toEqual(
        await selected(ctx),
      );
    }
  });

  test("an anonymous caller holding edit_own is owed published rows only", async () => {
    const ctx = viewer(TIERS.contributor.capabilities, null);

    const byPredicate = rows
      .filter((row) => canReadEntry(ctx, row))
      .map((row) => row.slug);

    expect(byPredicate).toEqual(PUBLISHED);
    expect(await selected(ctx)).toEqual(PUBLISHED);
  });

  test("is null for a type the caller may not read", () => {
    expect(readableEntryRows(viewer(["entry:post:edit_any"]), "post")).toBe(
      null,
    );
  });
});

// `news` pools its permissions with `post`: a caller holding `entry:post:*`
// reaches news rows, and the rows are still matched by their own type name.
describe("a type pooled onto another's capabilities", () => {
  let newsRows: Entry[];
  let pooled: PluginRegistry;

  beforeAll(async () => {
    pooled = await pooledEntryTypeRegistry();
    const factory = factoriesFor(db);
    const other = await factory.user.create({
      email: "other-news@example.com",
    });
    newsRows = [];
    for (const [who, authorId] of [
      ["mine", caller.id],
      ["theirs", other.id],
    ] as const) {
      for (const status of ["published", "draft"] as const) {
        newsRows.push(
          await factory.entry.create({
            type: "news",
            authorId,
            status,
            slug: `news-${status}-${who}`,
            publishedAt: status === "published" ? new Date() : null,
          }),
        );
      }
    }
  });

  function pooledViewer(capabilities: readonly string[]): EntryViewer {
    return { ...viewer(capabilities), plugins: pooled };
  }

  async function selectedOf(ctx: EntryViewer, type: string): Promise<string[]> {
    const clause = readableEntryRows(ctx, type);
    if (clause === null) return [];
    const found = await db
      .select({ slug: entries.slug })
      .from(entries)
      .where(clause)
      .orderBy(asc(entries.id));
    return found.map((row) => row.slug);
  }

  test("a contributor holding entry:post:edit_own sees their own draft and not another's", async () => {
    const ctx = pooledViewer(TIERS.contributor.capabilities);
    const sees = [
      "news-published-mine",
      "news-draft-mine",
      "news-published-theirs",
    ];

    const byPredicate = newsRows
      .filter((row) => canReadEntry(ctx, row))
      .map((row) => row.slug);

    expect(byPredicate).toEqual(sees);
    expect(await selectedOf(ctx, "news")).toEqual(sees);
  });

  test("a subscriber holding only entry:post:read sees published rows and no drafts", async () => {
    const ctx = pooledViewer(TIERS.reader.capabilities);
    const sees = ["news-published-mine", "news-published-theirs"];

    const byPredicate = newsRows
      .filter((row) => canReadEntry(ctx, row))
      .map((row) => row.slug);

    expect(byPredicate).toEqual(sees);
    expect(await selectedOf(ctx, "news")).toEqual(sees);
  });

  test("rows are matched by the registered name, so neither type's clause admits the other's rows", async () => {
    const ctx = pooledViewer(TIERS.editor.capabilities);

    const news = await selectedOf(ctx, "news");
    const posts = await selectedOf(ctx, "post");

    expect(news).toEqual(newsRows.map((row) => row.slug));
    expect(news.some((slug) => !slug.startsWith("news-"))).toBe(false);
    expect(posts.some((slug) => slug.startsWith("news-"))).toBe(false);
    expect(posts).toEqual(TIERS.editor.sees);
  });
});
