import { describe, expect, test } from "vitest";

import type { EntryFieldScope } from "../../../plugin/fields/entry.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/contract/meta-key.js";
import {
  anonymousPolicy,
  authenticatedPolicy,
} from "../../../access/policy.js";
import { requestStore } from "../../../context/stores.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";
import { entryLookupAdapter } from "./lookup.js";

const POST = { entryTypes: ["post"] } as const;
const PAGE = { entryTypes: ["page"] } as const;

/** Core alone: no entry type is registered, `post` included. */
const site = await testSite({ plugins: [] });

/** `page` pools onto `post`'s capabilities. */
const pooledPagesSite = await testSite({
  plugins: [
    definePlugin("pooled-pages", {
      setup: (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          capabilityType: "post",
        });
      },
    }),
  ],
});

/** A public, nestable `page` and a `ledger` that is never rendered. */
const pagesSite = await testSite({
  plugins: [
    definePlugin("pages", {
      setup: (ctx) => {
        ctx.registerEntryType("page", {
          label: "Pages",
          isPublic: true,
          isHierarchical: true,
        });
        ctx.registerEntryType("ledger", { label: "Ledgers", isPublic: false });
      },
    }),
  ],
});

/** A public `post`, so its rows have a permalink. */
const postsSite = await testSite({
  plugins: [
    definePlugin("posts", {
      setup: (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      },
    }),
  ],
});

/** A public `page` whose entries choose between two access policies. */
const accessSite = await testSite({
  plugins: [
    definePlugin("pages-with-access", {
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
                policy: authenticatedPolicy,
              },
            ],
          },
        });
      },
    }),
  ],
});

/** Whether `list({ ids })` answers for the id, as a reference's existence check asks. */
async function listsId(
  ctx: typeof site.context,
  id: string,
  scope: EntryFieldScope,
): Promise<boolean> {
  const rows = await entryLookupAdapter.list(ctx, {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

describe("entryLookupAdapter.list by id", () => {
  test("finds an active entry under a matching scope", async () => {
    const admin = await site.factory.admin.create();
    const entry = await site.factory.entry.create({ authorId: admin.id });

    const found = await listsId(
      site.actingAs(admin).context,
      String(entry.id),
      POST,
    );

    expect(found).toBe(true);
  });

  test("finds nothing for an id no entry has", async () => {
    const admin = await site.factory.admin.create();

    const found = await listsId(site.actingAs(admin).context, "999999", POST);

    expect(found).toBe(false);
  });

  test.each(["", "abc", "0", "-1", "1.5"])(
    "drops the malformed id %j before querying",
    async (id) => {
      const admin = await site.factory.admin.create();

      const found = await listsId(site.actingAs(admin).context, id, POST);

      expect(found).toBe(false);
    },
  );

  // `page` pools onto `post`'s capabilities, so a miss comes from the type
  // filter, not from `page` being unreadable.
  test.each([
    { type: "post", scope: PAGE, found: false },
    { type: "post", scope: POST, found: true },
    { type: "page", scope: PAGE, found: true },
  ])(
    "finds a $type under the scope $scope.entryTypes: $found",
    async ({ type, scope, found }) => {
      const admin = await pooledPagesSite.factory.admin.create();
      const entry = await pooledPagesSite.factory.entry.create({
        authorId: admin.id,
        type,
      });

      const listed = await listsId(
        pooledPagesSite.actingAs(admin).context,
        String(entry.id),
        scope,
      );

      expect(listed).toBe(found);
    },
  );

  test("leaves out a trashed entry by default", async () => {
    const admin = await site.factory.admin.create();
    const trashed = await site.factory.entry.create({
      authorId: admin.id,
      status: "trash",
    });

    const found = await listsId(
      site.actingAs(admin).context,
      String(trashed.id),
      POST,
    );

    expect(found).toBe(false);
  });

  test("finds a trashed entry when the scope includes trash", async () => {
    const admin = await site.factory.admin.create();
    const trashed = await site.factory.entry.create({
      authorId: admin.id,
      status: "trash",
    });

    const found = await listsId(
      site.actingAs(admin).context,
      String(trashed.id),
      { ...POST, includeTrashed: true },
    );

    expect(found).toBe(true);
  });

  // With no status, drafts stay admitted: the admin picker's shape.
  test.each([
    { status: "draft", scope: { ...POST, status: "published" }, found: false },
    {
      status: "published",
      scope: { ...POST, status: "published" },
      found: true,
    },
    { status: "draft", scope: POST, found: true },
  ] as const)(
    "finds a $status entry under the scope status $scope.status: $found",
    async ({ status, scope, found }) => {
      const admin = await site.factory.admin.create();
      const entry = await site.factory.entry.create({
        authorId: admin.id,
        status,
      });

      const listed = await listsId(
        site.actingAs(admin).context,
        String(entry.id),
        scope,
      );

      expect(listed).toBe(found);
    },
  );

  test("finds several ids in one call, dropping the missing one", async () => {
    const admin = await site.factory.admin.create();
    const a = await site.factory.entry.create({ authorId: admin.id });
    const b = await site.factory.entry.create({ authorId: admin.id });

    const rows = await entryLookupAdapter.list(site.actingAs(admin).context, {
      ids: [String(a.id), String(b.id), "999999"],
      scope: POST,
      limit: 3,
    });

    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set([String(a.id), String(b.id)]),
    );
  });

  test("returns the full lookup result, target type and permalink included", async () => {
    // The single-reference picker resolves its selected id through this path.
    const admin = await postsSite.factory.admin.create();
    const entry = await postsSite.factory.entry.create({
      authorId: admin.id,
      title: "Specific",
      slug: "specific",
    });

    const [result] = await entryLookupAdapter.list(
      postsSite.actingAs(admin).context,
      { ids: [String(entry.id)], scope: POST, limit: 1 },
    );

    expect(result?.id).toBe(String(entry.id));
    expect(result?.label).toBe("Specific");
    // The admin picker picks its per-type `labels.untitledItem` by it.
    expect(result?.targetType).toBe("post");
    // Menu resolution renders links from it at read time.
    expect(result?.href).toBe("/post/specific");
  });

  test("labels an entry with a blank title null, so the admin can localize it", async () => {
    const admin = await site.factory.admin.create();
    const entry = await site.factory.entry.create({
      authorId: admin.id,
      title: "   ",
    });

    const [result] = await entryLookupAdapter.list(
      site.actingAs(admin).context,
      { ids: [String(entry.id)], scope: POST, limit: 1 },
    );

    expect(result?.label).toBeNull();
  });
});

describe("entryLookupAdapter.list's scope", () => {
  test("refuses a status outside the entry statuses", async () => {
    // The lookup RPC forwards scope untyped, so a wire caller can send any
    // value; it must fail as a named scope error, not a driver bind failure.
    const garbage = { ...POST, status: {} } as unknown as EntryFieldScope;

    const listing = entryLookupAdapter.list(site.context, {
      ids: ["1"],
      scope: garbage,
    });

    await expect(listing).rejects.toThrow(/scope.status/);
  });

  test("refuses entry types that are not an array", async () => {
    // A bare string is truthy and has a `length`, so it would pass a shape
    // check and then be read one character at a time.
    const garbage = { entryTypes: "post" } as unknown as EntryFieldScope;

    const listing = entryLookupAdapter.list(site.context, { scope: garbage });

    await expect(listing).rejects.toThrow(/entryTypes is required/);
  });

  // Without a scope, the picker would expose every type.
  test.each([{}, { ids: ["1"] }])(
    "is required, even for %j",
    async (options) => {
      const listing = entryLookupAdapter.list(site.context, options);

      await expect(listing).rejects.toThrow(/entryTypes is required/);
    },
  );

  // An autosave holds another author's unsaved title, so naming one would open
  // a read channel into pending edits. Beside a real type it is still refused.
  test.each([[["revision"]], [["autosave"]], [["post", "autosave"]]])(
    "refuses the reserved type in %j",
    async (entryTypes) => {
      const listing = entryLookupAdapter.list(site.context, {
        scope: { entryTypes },
      });

      await expect(listing).rejects.toThrow(
        expect.objectContaining({ code: "reserved_entry_type" }),
      );
    },
  );

  test("refuses an empty list of entry types", async () => {
    const listing = entryLookupAdapter.list(site.context, {
      scope: { entryTypes: [] },
    });

    await expect(listing).rejects.toThrow(/entryTypes is required/);
  });
});

describe("entryLookupAdapter.list and the viewer", () => {
  // A member is public-reachable wherever `auth.selfSignup` is on, so it must
  // not enumerate the titles of unpublished entries.
  test("offers a member only another author's published entries", async () => {
    const admin = await site.factory.admin.create();
    const member = await site.factory.member.create();
    const published = await site.factory.entry.create({
      authorId: admin.id,
      title: "Shipped",
      status: "published",
    });
    await site.factory.entry.create({
      authorId: admin.id,
      title: "Unshipped",
      status: "draft",
    });
    await site.factory.entry.create({
      authorId: admin.id,
      title: "Queued",
      status: "scheduled",
    });

    const rows = await entryLookupAdapter.list(site.actingAs(member).context, {
      scope: POST,
      limit: 100,
    });

    expect(rows.map((row) => row.id)).toEqual([String(published.id)]);
  });

  test("finds a member only another author's published entries by id", async () => {
    // So the batch path can't answer what the search path refuses.
    const admin = await site.factory.admin.create();
    const member = await site.factory.member.create();
    const published = await site.factory.entry.create({
      authorId: admin.id,
      title: "Shipped",
      status: "published",
    });
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      title: "Unshipped",
      status: "draft",
    });
    const scheduled = await site.factory.entry.create({
      authorId: admin.id,
      title: "Queued",
      status: "scheduled",
    });

    const rows = await entryLookupAdapter.list(site.actingAs(member).context, {
      ids: [String(published.id), String(draft.id), String(scheduled.id)],
      scope: POST,
    });

    expect(rows.map((row) => row.id)).toEqual([String(published.id)]);
  });

  test("offers an author their own unpublished entries, not a colleague's", async () => {
    // `edit_own` is what an author has instead of `edit_any`.
    const admin = await site.factory.admin.create();
    const writer = await site.factory.author.create();
    const mine = await site.factory.entry.create({
      authorId: writer.id,
      title: "Mine",
      status: "draft",
    });
    const theirs = await site.factory.entry.create({
      authorId: admin.id,
      title: "Theirs",
      status: "draft",
    });

    const rows = await entryLookupAdapter.list(site.actingAs(writer).context, {
      scope: POST,
      limit: 100,
    });

    const ids = rows.map((row) => row.id);
    expect(ids).toContain(String(mine.id));
    expect(ids).not.toContain(String(theirs.id));
  });

  test("answers a caller with no principal with a public type's published entries only", async () => {
    // Public nav resolves menu targets through this adapter with no principal.
    const admin = await pagesSite.factory.admin.create();
    const live = await pagesSite.factory.entry.create({
      type: "page",
      status: "published",
      authorId: admin.id,
    });
    await pagesSite.factory.entry.create({
      type: "page",
      status: "draft",
      authorId: admin.id,
    });
    await pagesSite.factory.entry.create({
      type: "ledger",
      status: "published",
      authorId: admin.id,
    });

    const rows = await entryLookupAdapter.list(pagesSite.context, {
      scope: { entryTypes: ["page", "ledger"] },
      limit: 100,
    });

    expect(rows.map((row) => row.id)).toEqual([String(live.id)]);
  });

  test("joins two viewer rules with OR without losing the scope filter", async () => {
    // Two operands is the only arity where `or` precedence against the
    // surrounding `and` can go wrong; the trashed row pins that the scope
    // still binds.
    const admin = await pagesSite.factory.admin.create();
    const writer = await pagesSite.factory.author.create();
    const ownDraft = await pagesSite.factory.entry.create({
      type: "post",
      status: "draft",
      authorId: writer.id,
    });
    const livePage = await pagesSite.factory.entry.create({
      type: "page",
      status: "published",
      authorId: admin.id,
    });
    const draftPage = await pagesSite.factory.entry.create({
      type: "page",
      status: "draft",
      authorId: admin.id,
    });
    const trashedOwn = await pagesSite.factory.entry.create({
      type: "post",
      status: "trash",
      authorId: writer.id,
    });

    const rows = await entryLookupAdapter.list(
      pagesSite.actingAs(writer).context,
      { scope: { entryTypes: ["post", "page"] }, limit: 100 },
    );

    const ids = rows.map((row) => row.id);
    // `post` through the readable arm, `page` through the public one.
    expect(new Set(ids)).toEqual(
      new Set([String(ownDraft.id), String(livePage.id)]),
    );
    expect(ids).not.toContain(String(draftPage.id));
    expect(ids).not.toContain(String(trashedOwn.id));
  });
});

describe("entryLookupAdapter.list by query", () => {
  test("matches a case-insensitive substring of the title", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.entry.create({
      authorId: admin.id,
      title: "Alpha Release",
    });
    await site.factory.entry.create({
      authorId: admin.id,
      title: "Beta Notes",
    });

    const matches = await entryLookupAdapter.list(
      site.actingAs(admin).context,
      { query: "alpha", scope: POST },
    );

    const labels = matches.map((row) => row.label);
    expect(labels).toContain("Alpha Release");
    expect(labels).not.toContain("Beta Notes");
  });

  test("returns no more than the limit", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.entry.createList(5, { authorId: admin.id });

    const rows = await entryLookupAdapter.list(site.actingAs(admin).context, {
      limit: 2,
      scope: POST,
    });

    expect(rows).toHaveLength(2);
  });

  test("clamps a limit of zero to the default", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.entry.createList(5, { authorId: admin.id });

    const rows = await entryLookupAdapter.list(site.actingAs(admin).context, {
      limit: 0,
      scope: POST,
    });

    expect(rows.length).toBeLessThanOrEqual(20);
  });

  test("subtitles a row with its type and status", async () => {
    const admin = await site.factory.admin.create();
    await site.factory.entry.create({
      authorId: admin.id,
      title: "Released",
      status: "published",
    });

    const [row] = await entryLookupAdapter.list(site.actingAs(admin).context, {
      query: "Released",
      scope: POST,
    });

    expect(row?.subtitle).toContain("post");
    expect(row?.subtitle).toContain("published");
  });
});

describe("entryLookupAdapter.hydrate", () => {
  test("resolves ids into entry summaries with permalinks", async () => {
    const admin = await postsSite.factory.admin.create();
    const entry = await postsSite.factory.entry.create({
      authorId: admin.id,
      title: "Referenced",
      type: "post",
      slug: "referenced",
    });

    const rows = await entryLookupAdapter.hydrate(
      postsSite.actingAs(admin).context,
      { ids: [String(entry.id)], scope: POST },
    );

    expect(rows).toEqual([
      {
        id: String(entry.id),
        type: "post",
        title: "Referenced",
        slug: "referenced",
        url: "/post/referenced",
      },
    ]);
  });

  test("leaves out missing, malformed and trashed ids", async () => {
    const admin = await site.factory.admin.create();
    const post = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
    });
    const trashed = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "trash",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(admin).context,
      {
        ids: [String(post.id), String(trashed.id), "999999", "abc"],
        scope: POST,
      },
    );

    expect(rows.map((row) => row.id)).toEqual([String(post.id)]);
  });

  test("leaves out an entry outside the scope's types", async () => {
    // `hydrate` has only the scope's list, which keeps a referenced id from
    // resolving into a type the field never declared.
    const admin = await pagesSite.factory.admin.create();
    const page = await pagesSite.factory.entry.create({
      type: "page",
      status: "published",
      authorId: admin.id,
    });

    const rows = await entryLookupAdapter.hydrate(
      pagesSite.actingAs(admin).context,
      { ids: [String(page.id)], scope: POST },
    );

    expect(rows).toEqual([]);
  });

  test("keeps to a status the scope names", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });
    const published = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "published",
    });

    const rows = await entryLookupAdapter.hydrate(site.context, {
      ids: [String(draft.id), String(published.id)],
      scope: { ...POST, status: "published" },
    });

    expect(rows.map((row) => row.id)).toEqual([String(published.id)]);
  });

  // Hydration feeds public render and anonymous REST, so a referenced draft
  // stays invisible there, while editors keep seeing drafts as the picker does.
  test("hides a draft from a caller with no principal", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(site.context, {
      ids: [String(draft.id)],
      scope: POST,
    });

    expect(rows).toEqual([]);
  });

  test("shows a draft to an admin", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(admin).context,
      { ids: [String(draft.id)], scope: POST },
    );

    expect(rows.map((row) => row.id)).toEqual([String(draft.id)]);
  });

  // A field's `scope.status` is which rows it wants, not which the reader may
  // have; as an override it would hand anonymous renders authors' drafts.
  test("hides a draft from a caller with no principal even when the scope asks for drafts", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(site.context, {
      ids: [String(draft.id)],
      scope: { ...POST, status: "draft" },
    });

    expect(rows).toEqual([]);
  });

  test("shows a draft to an admin when the scope asks for drafts", async () => {
    const admin = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(admin).context,
      { ids: [String(draft.id)], scope: { ...POST, status: "draft" } },
    );

    expect(rows.map((row) => row.id)).toEqual([String(draft.id)]);
  });

  test("shows an author their own draft, not a colleague's", async () => {
    // `edit_own` over one's own rows, as every other read surface rules, so an
    // author's preview hydrates their own draft.
    const admin = await site.factory.admin.create();
    const writer = await site.factory.author.create();
    const mine = await site.factory.entry.create({
      authorId: writer.id,
      type: "post",
      status: "draft",
    });
    const theirs = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(writer).context,
      { ids: [String(mine.id), String(theirs.id)], scope: POST },
    );

    expect(rows.map((row) => row.id)).toEqual([String(mine.id)]);
  });

  test("narrows a scope asking for drafts to the author's own", async () => {
    // A viewer who earns drafts only by authorship gets "my own drafts", the
    // shape a preview surface asks for.
    const admin = await site.factory.admin.create();
    const writer = await site.factory.author.create();
    const mine = await site.factory.entry.create({
      authorId: writer.id,
      type: "post",
      status: "draft",
    });
    const theirs = await site.factory.entry.create({
      authorId: admin.id,
      type: "post",
      status: "draft",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(writer).context,
      {
        ids: [String(mine.id), String(theirs.id)],
        scope: { ...POST, status: "draft" },
      },
    );

    expect(rows.map((row) => row.id)).toEqual([String(mine.id)]);
  });

  test("titles an entry with a blank title null", async () => {
    const admin = await site.factory.admin.create();
    const entry = await site.factory.entry.create({
      authorId: admin.id,
      title: "   ",
    });

    const rows = await entryLookupAdapter.hydrate(
      site.actingAs(admin).context,
      { ids: [String(entry.id)], scope: POST },
    );

    expect(rows[0]?.title).toBeNull();
  });
});

describe("entryLookupAdapter over nested entries", () => {
  // Each child sits under its own parent, so a per-row ancestor walk would
  // cost a query per child.
  async function nestedPage(n: number): Promise<string> {
    const author = await pagesSite.factory.user.create();
    const parent = await pagesSite.factory.entry.create({
      type: "page",
      slug: `parent-${String(n)}`,
      title: "Parent",
      status: "published",
      authorId: author.id,
    });
    const child = await pagesSite.factory.entry.create({
      type: "page",
      slug: `child-${String(n)}`,
      title: "Child",
      status: "published",
      authorId: author.id,
      parentId: parent.id,
    });
    return String(child.id);
  }

  async function countQueries<T>(
    read: (ctx: typeof pagesSite.context) => Promise<T>,
  ): Promise<{ readonly result: T; readonly queries: number }> {
    const ctx = pagesSite.context;
    const result = await requestStore.run(ctx, () => read(ctx));
    const queries = ctx.telemetry
      .getSpans()
      .filter((span) => span.name.startsWith("db:")).length;
    return { result, queries };
  }

  test("hydrate costs the same queries however many entries it holds", async () => {
    const first = await nestedPage(0);
    const one = await countQueries((ctx) =>
      entryLookupAdapter.hydrate(ctx, { ids: [first], scope: PAGE }),
    );
    const ids = [
      first,
      await nestedPage(1),
      await nestedPage(2),
      await nestedPage(3),
    ];

    const four = await countQueries((ctx) =>
      entryLookupAdapter.hydrate(ctx, { ids, scope: PAGE }),
    );

    expect(four.result.map((row) => row.url)).toEqual([
      "/page/parent-0/child-0",
      "/page/parent-1/child-1",
      "/page/parent-2/child-2",
      "/page/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });

  test("list by id costs the same queries however many entries it holds", async () => {
    const first = await nestedPage(0);
    const one = await countQueries((ctx) =>
      entryLookupAdapter.list(ctx, { ids: [first], scope: PAGE, limit: 1 }),
    );
    const ids = [
      first,
      await nestedPage(1),
      await nestedPage(2),
      await nestedPage(3),
    ];

    const four = await countQueries((ctx) =>
      entryLookupAdapter.list(ctx, { ids, scope: PAGE, limit: 4 }),
    );

    expect(four.result.map((row) => row.href)).toEqual([
      "/page/parent-0/child-0",
      "/page/parent-1/child-1",
      "/page/parent-2/child-2",
      "/page/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });
});

describe("entryLookupAdapter and an entry's access policy", () => {
  async function publicAndMembersPages(): Promise<string[]> {
    const author = await accessSite.factory.admin.create();
    const publicPage = await accessSite.factory.entry.create({
      type: "page",
      status: "published",
      authorId: author.id,
      slug: "public-page",
    });
    const membersPage = await accessSite.factory.entry.create({
      type: "page",
      status: "published",
      authorId: author.id,
      slug: "members-page",
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
    });
    return [String(publicPage.id), String(membersPage.id)];
  }

  test("hydrate resolves for an anonymous render only the references its policy admits", async () => {
    const ids = await publicAndMembersPages();

    const rows = await entryLookupAdapter.hydrate(accessSite.context, {
      ids,
      scope: PAGE,
    });

    expect(rows.map((row) => row.slug)).toEqual(["public-page"]);
  });

  test("list offers an anonymous caller only the entries its policy admits", async () => {
    await publicAndMembersPages();

    const rows = await entryLookupAdapter.list(accessSite.context, {
      scope: PAGE,
    });

    expect(rows.map((row) => row.href)).toEqual(["/page/public-page"]);
  });
});
