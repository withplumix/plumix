import { beforeAll, describe, expect, test, vi } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import type { Entry } from "../db/schema/entries.js";
import type { PluginRegistry } from "../plugin/registry.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
} from "../access/policy.js";
import { asc } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { createTestContext } from "../test/context.js";
import { factoriesFor } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { pooledEntryTypeRegistry } from "../test/pooled-entry-types.js";
import {
  canReadEntry,
  publicEntryRows,
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
): AppContext {
  return {
    ...createTestContext({ db }),
    user,
    auth: { can: (capability: string) => capabilities.includes(capability) },
  };
}

async function readableBy(
  ctx: AppContext,
  candidates: readonly Entry[],
): Promise<string[]> {
  const verdicts = await Promise.all(
    candidates.map((row) => canReadEntry(ctx, row)),
  );
  return candidates
    .filter((_, index) => verdicts[index])
    .map((row) => row.slug);
}

async function selected(ctx: AppContext): Promise<string[]> {
  const clause = await readableEntryRows(ctx, "post");
  if (clause === null) return [];
  return slugsWhere(clause);
}

async function selectedReferenceable(ctx: AppContext): Promise<string[]> {
  return slugsWhere(await referenceableEntryRows(ctx, "post"));
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

/**
 * Each tier with the rows it is owed, so the SQL and the predicate are each
 * held to the rule and not only to each other.
 */
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

      const byPredicate = await readableBy(ctx, rows);

      expect(byPredicate).toEqual(sees);
      expect(await selected(ctx)).toEqual(sees);
    });
  }

  // `read` is all `readableEntryRows` asks on top, so a tier holding it must
  // not tell the two apart.
  test.each(["reader", "contributor", "editor"] as const)(
    "matches referenceableEntryRows for a %s",
    async (tier) => {
      const ctx = viewer(TIERS[tier].capabilities);

      const referenceable = await selectedReferenceable(ctx);

      expect(referenceable).toEqual(await selected(ctx));
    },
  );

  test("an anonymous caller holding edit_own is owed published rows only", async () => {
    const ctx = viewer(TIERS.contributor.capabilities, null);

    const byPredicate = await readableBy(ctx, rows);

    expect(byPredicate).toEqual(PUBLISHED);
    expect(await selected(ctx)).toEqual(PUBLISHED);
  });

  test("is null for a type the caller may not read", async () => {
    expect(
      await readableEntryRows(viewer(["entry:post:edit_any"]), "post"),
    ).toBe(null);
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

  function pooledViewer(capabilities: readonly string[]): AppContext {
    return { ...viewer(capabilities), plugins: pooled };
  }

  async function selectedOf(ctx: AppContext, type: string): Promise<string[]> {
    const clause = await readableEntryRows(ctx, type);
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

    const byPredicate = await readableBy(ctx, newsRows);

    expect(byPredicate).toEqual(sees);
    expect(await selectedOf(ctx, "news")).toEqual(sees);
  });

  test("a subscriber holding only entry:post:read sees published rows and no drafts", async () => {
    const ctx = pooledViewer(TIERS.reader.capabilities);
    const sees = ["news-published-mine", "news-published-theirs"];

    const byPredicate = await readableBy(ctx, newsRows);

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

describe("an entry type with an access policy", () => {
  let policied: TestDb;
  let registry: PluginRegistry;
  let author: AuthenticatedUser;
  const pages: Entry[] = [];
  const membersResolver = vi.fn(authenticatedPolicy.resolve);

  beforeAll(async () => {
    policied = await createTestDb();
    registry = await pooledEntryTypeRegistry(
      definePlugin("pages", {
        setup: (ctx) => {
          ctx.registerEntryType("page", {
            label: "Pages",
            isPublic: true,
            access: {
              default: anonymousPolicy,
              policies: [
                {
                  key: "members",
                  label: "Members",
                  policy: definePolicy({ resolve: membersResolver }),
                },
                {
                  key: "sealed",
                  label: "Sealed",
                  policy: definePolicy({
                    resolve: () => challenge("forbidden"),
                  }),
                },
              ],
            },
          });
        },
      }),
    );
    const factory = factoriesFor(policied);
    author = await factory.user.create({ role: "author" });
    for (const [slug, meta] of [
      ["public", {}],
      ["members", { [ACCESS_POLICY_META_KEY]: "members" }],
      ["stale", { [ACCESS_POLICY_META_KEY]: "ghost" }],
      ["sealed", { [ACCESS_POLICY_META_KEY]: "sealed" }],
    ] as const) {
      pages.push(
        await factory.entry.create({
          type: "page",
          authorId: author.id,
          status: "published",
          slug,
          publishedAt: new Date(),
          meta,
        }),
      );
    }
  });

  async function publicSlugs(ctx: AppContext): Promise<string[]> {
    const clause = await publicEntryRows(ctx);
    if (clause === null) return [];
    const found = await policied
      .select({ slug: entries.slug })
      .from(entries)
      .where(clause)
      .orderBy(asc(entries.id));
    return found.map((row) => row.slug);
  }

  test("publicEntryRows lists an anonymous principal only the rows its policy admits", async () => {
    const ctx = createTestContext({ db: policied, plugins: registry });

    expect(await publicSlugs(ctx)).toEqual(["public", "stale"]);
  });

  test("publicEntryRows lists a signed-in member the members page too", async () => {
    const member = await factoriesFor(policied).user.create();
    const ctx = createTestContext({
      db: policied,
      plugins: registry,
      user: member,
    });

    expect(await publicSlugs(ctx)).toEqual(["public", "members", "stale"]);
  });

  test("resolves each policy once per request however often the rule is asked", async () => {
    const ctx = createTestContext({ db: policied, plugins: registry });
    membersResolver.mockClear();

    await publicSlugs(ctx);
    await publicSlugs(ctx);

    expect(membersResolver).toHaveBeenCalledTimes(1);
  });

  function pageReader(
    capabilities: readonly string[],
    user: AuthenticatedUser | null,
  ): AppContext {
    return {
      ...createTestContext({ db: policied, plugins: registry }),
      user,
      auth: { can: (capability: string) => capabilities.includes(capability) },
    };
  }

  async function readableSlugs(ctx: AppContext): Promise<string[]> {
    const clause = await readableEntryRows(ctx, "page");
    const bySql =
      clause === null
        ? []
        : (
            await policied
              .select({ slug: entries.slug })
              .from(entries)
              .where(clause)
              .orderBy(asc(entries.id))
          ).map((row) => row.slug);
    const byPredicate = await readableBy(ctx, pages);
    expect(bySql).toEqual(byPredicate);
    return byPredicate;
  }

  test("readableEntryRows admits a reader with no principal only the published rows its policy admits", async () => {
    const ctx = pageReader(["entry:page:read"], null);

    expect(await readableSlugs(ctx)).toEqual(["public", "stale"]);
  });

  test("readableEntryRows admits a signed-in member the members page", async () => {
    const member = await factoriesFor(policied).user.create();
    const ctx = pageReader(["entry:page:read"], member);

    expect(await readableSlugs(ctx)).toEqual(["public", "members", "stale"]);
  });

  test("an editor reads every row whatever its policy", async () => {
    const editor = await factoriesFor(policied).user.create({ role: "editor" });
    const ctx = pageReader(["entry:page:read", "entry:page:edit_any"], editor);

    expect(await readableSlugs(ctx)).toEqual([
      "public",
      "members",
      "stale",
      "sealed",
    ]);
  });

  test("referenceableEntryRows offers an editor every published row whatever its policy", async () => {
    const editor = await factoriesFor(policied).user.create({ role: "editor" });
    const ctx = pageReader(["entry:page:edit_any"], editor);

    const clause = await referenceableEntryRows(ctx, "page");
    const found = await policied
      .select({ slug: entries.slug })
      .from(entries)
      .where(clause)
      .orderBy(asc(entries.id));

    expect(found.map((row) => row.slug)).toEqual([
      "public",
      "members",
      "stale",
      "sealed",
    ]);
  });

  test("an author reads the rows they wrote whatever their policy", async () => {
    const ctx = pageReader(["entry:page:read", "entry:page:edit_own"], author);

    expect(await readableSlugs(ctx)).toEqual([
      "public",
      "members",
      "stale",
      "sealed",
    ]);
  });
});

describe("an entry type whose default admits nobody anonymous", () => {
  let gated: TestDb;
  let registry: PluginRegistry;

  beforeAll(async () => {
    gated = await createTestDb();
    registry = await pooledEntryTypeRegistry(
      definePlugin("members-pages", {
        setup: (ctx) => {
          ctx.registerEntryType("page", {
            label: "Pages",
            isPublic: true,
            access: {
              default: authenticatedPolicy,
              policies: [
                { key: "open", label: "Open", policy: anonymousPolicy },
              ],
            },
          });
        },
      }),
    );
    const factory = factoriesFor(gated);
    const author = await factory.user.create({ role: "author" });
    for (const [slug, meta] of [
      ["unset", {}],
      ["open", { [ACCESS_POLICY_META_KEY]: "open" }],
      ["stale", { [ACCESS_POLICY_META_KEY]: "ghost" }],
      ["numeric", { [ACCESS_POLICY_META_KEY]: 7 }],
      ["listed", { [ACCESS_POLICY_META_KEY]: ["open"] }],
    ] as const) {
      await factory.entry.create({
        type: "page",
        authorId: author.id,
        status: "published",
        slug,
        publishedAt: new Date(),
        meta,
      });
    }
  });

  async function listedSlugs(ctx: AppContext): Promise<string[]> {
    const clause = await publicEntryRows(ctx);
    if (clause === null) return [];
    const found = await gated
      .select({ slug: entries.slug })
      .from(entries)
      .where(clause)
      .orderBy(asc(entries.id));
    return found.map((row) => row.slug);
  }

  async function readableSlugs(ctx: AppContext): Promise<string[]> {
    const clause = await readableEntryRows(ctx, "page");
    if (clause === null) return [];
    const found = await gated
      .select({ slug: entries.slug })
      .from(entries)
      .where(clause)
      .orderBy(asc(entries.id));
    return found.map((row) => row.slug);
  }

  test("an anonymous visitor is listed only the entry that chose the open policy", async () => {
    const ctx = createTestContext({ db: gated, plugins: registry });

    expect(await listedSlugs(ctx)).toEqual(["open"]);
  });

  test("a signed-in member is listed every entry, a malformed key falling to the default", async () => {
    const member = await factoriesFor(gated).user.create();
    const ctx = createTestContext({
      db: gated,
      plugins: registry,
      user: member,
    });

    expect(await listedSlugs(ctx)).toEqual([
      "unset",
      "open",
      "stale",
      "numeric",
      "listed",
    ]);
  });

  test("canReadEntry and readableEntryRows admit the same entries", async () => {
    const reader: AppContext = {
      ...createTestContext({ db: gated, plugins: registry }),
      auth: { can: (capability) => capability === "entry:page:read" },
    };
    const stored = await gated.select().from(entries).orderBy(asc(entries.id));

    const readable = await readableBy(reader, stored);

    expect(readable).toEqual(["open"]);
    expect(await readableSlugs(reader)).toEqual(readable);
  });
});
