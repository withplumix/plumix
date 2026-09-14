import { beforeAll, describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import type { Entry } from "../db/schema/entries.js";
import type { EntryViewer } from "./visibility.js";
import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { canReadEntry, readableEntryRows } from "./visibility.js";

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
  };
}

async function selected(ctx: EntryViewer): Promise<string[]> {
  const clause = readableEntryRows(ctx, "post");
  if (clause === null) return [];
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
