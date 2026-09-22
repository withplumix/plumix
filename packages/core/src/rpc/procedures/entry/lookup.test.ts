import { describe, expect, test } from "vitest";

import type { EntryFieldScope } from "../../../plugin/fields/entry.js";
import type { MutablePluginRegistry } from "../../../plugin/manifest.js";
import type { AuthenticatedRpcHarness } from "../../../test/rpc.js";
import { withUser } from "../../../context/app.js";
import { definePlugin } from "../../../plugin/define.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredEntryType } from "../../../plugin/registry.js";
import {
  AUTOSAVE_TYPE,
  RESERVED_TYPES,
} from "../../../revisions/slug-codec.js";
import { entryFactory, userFactory } from "../../../test/factories.js";
import { authedCtx, createRpcHarness } from "../../../test/rpc.js";
import { createTracedContext } from "../../../test/traced-context.js";
import { entryLookupAdapter } from "./lookup.js";

const POST = { entryTypes: ["post"] } as const;
const PAGE = { entryTypes: ["page"] } as const;

// Existence checks now ride the `list({ ids })` batch path — same
// scope rules, single query.
async function existsViaList(
  h: AuthenticatedRpcHarness,
  id: string,
  scope: EntryFieldScope,
): Promise<boolean> {
  const rows = await entryLookupAdapter.list(authedCtx(h), {
    ids: [id],
    scope,
    limit: 1,
  });
  return rows.some((row) => row.id === id);
}

describe("entryLookupAdapter", () => {
  test("list({ ids }) returns a row for an active entry under matching scope", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    expect(await existsViaList(h, String(e.id), POST)).toBe(true);
  });

  test("list({ ids }) returns nothing for a non-existent id", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    expect(await existsViaList(h, "999999", POST)).toBe(false);
  });

  test("list({ ids }) drops malformed ids before querying", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    expect(await existsViaList(h, "", POST)).toBe(false);
    expect(await existsViaList(h, "abc", POST)).toBe(false);
    expect(await existsViaList(h, "0", POST)).toBe(false);
    expect(await existsViaList(h, "-1", POST)).toBe(false);
    expect(await existsViaList(h, "1.5", POST)).toBe(false);
  });

  test("list({ ids }) honours the entryTypes scope filter", async () => {
    // `page` pools onto `post`'s capabilities, so the viewer may read
    // both types and the negative result below has to come from the
    // type filter rather than from `page` being dropped as unreadable.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "page",
      toRegisteredEntryType(
        "page",
        { label: "Pages", isPublic: true, capabilityType: "post" },
        null,
      ),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const page = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "page" });
    expect(await existsViaList(h, String(post.id), PAGE)).toBe(false);
    expect(await existsViaList(h, String(post.id), POST)).toBe(true);
    expect(await existsViaList(h, String(page.id), PAGE)).toBe(true);
  });

  test("list({ ids }) excludes trashed entries by default", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const trashed = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, status: "trash" });
    expect(await existsViaList(h, String(trashed.id), POST)).toBe(false);
    expect(
      await existsViaList(h, String(trashed.id), {
        ...POST,
        includeTrashed: true,
      }),
    ).toBe(true);
  });

  test("list({ ids }) honours a status scope constraint", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const draft = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, status: "draft" });
    const published = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, status: "published" });

    const publishedOnly = { ...POST, status: "published" } as const;
    expect(await existsViaList(h, String(draft.id), publishedOnly)).toBe(false);
    expect(await existsViaList(h, String(published.id), publishedOnly)).toBe(
      true,
    );
    // Default (no status) keeps admitting drafts — the admin picker's shape.
    expect(await existsViaList(h, String(draft.id), POST)).toBe(true);
  });

  test("rejects a status value outside ENTRY_STATUSES (wire-side garbage)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    // The lookup RPC forwards scope as an untyped record — a wire caller
    // can send any value. Non-member statuses must fail as a named scope
    // error, not a driver-level bind failure.
    const garbage = { ...POST, status: {} } as unknown as EntryFieldScope;
    await expect(
      entryLookupAdapter.list(h.context, { ids: ["1"], scope: garbage }),
    ).rejects.toThrow(/scope.status/);
  });

  test("rejects an entryTypes value that isn't an array (wire-side garbage)", async () => {
    // Same wire-side reality as `scope.status`: a bare string is truthy
    // and carries a `length`, so it would pass a shape check and then be
    // read one character at a time.
    const h = await createRpcHarness({ authAs: "admin" });
    const garbage = { entryTypes: "post" } as unknown as EntryFieldScope;
    await expect(
      entryLookupAdapter.list(h.context, { scope: garbage }),
    ).rejects.toThrow(/entryTypes is required/);
  });

  test("list({ ids }) batches multiple ids in one query", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id });
    const rows = await entryLookupAdapter.list(authedCtx(h), {
      ids: [String(a.id), String(b.id), "999999"],
      scope: POST,
      limit: 3,
    });
    const idSet = new Set(rows.map((r) => r.id));
    expect(idSet.has(String(a.id))).toBe(true);
    expect(idSet.has(String(b.id))).toBe(true);
    expect(idSet.has("999999")).toBe(false);
  });

  test("rejects calls without scope (would otherwise expose every type)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(entryLookupAdapter.list(h.context, {})).rejects.toThrow(
      /entryTypes is required/,
    );
    await expect(
      entryLookupAdapter.list(h.context, { ids: ["1"] }),
    ).rejects.toThrow(/entryTypes is required/);
  });

  test("rejects a scope naming a reserved type (revision / autosave rows)", async () => {
    // Revision and autosave rows share the `entries` table with content.
    // An autosave carries another author's unsaved title, so a scope
    // naming one would hand the picker a read channel into pending edits.
    const h = await createRpcHarness({ authAs: "admin" });
    for (const type of RESERVED_TYPES) {
      await expect(
        entryLookupAdapter.list(h.context, { scope: { entryTypes: [type] } }),
      ).rejects.toThrow(
        expect.objectContaining({ code: "reserved_entry_type" }),
      );
    }
    // Reserved alongside a real type is still rejected, not filtered down.
    await expect(
      entryLookupAdapter.list(h.context, {
        scope: { entryTypes: ["post", AUTOSAVE_TYPE] },
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "reserved_entry_type" }));
  });

  test("rejects calls with an empty entryTypes array (same disclosure shape)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      entryLookupAdapter.list(h.context, { scope: { entryTypes: [] } }),
    ).rejects.toThrow(/entryTypes is required/);
  });

  test("list() hides another author's unpublished entries from a viewer without edit rights", async () => {
    // A subscriber holds `entry:post:read` and nothing else, and the
    // role is reachable by the public wherever `auth.selfSignup` is on.
    // Titles of drafts, pending and scheduled entries are not theirs to
    // enumerate; published ones are what the site shows anyway.
    const h = await createRpcHarness({ authAs: "admin" });
    const subscriber = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "subscriber" });
    const published = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Shipped", status: "published" });
    const draft = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Unshipped", status: "draft" });
    const scheduled = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Queued", status: "scheduled" });

    const rows = await entryLookupAdapter.list(
      withUser(h.context, subscriber, null),
      { scope: POST, limit: 100 },
    );
    expect(rows.map((row) => row.id)).toEqual([String(published.id)]);

    // The same ids asked for by id, so the batch path can't answer what
    // the search path refuses.
    const byId = await entryLookupAdapter.list(
      withUser(h.context, subscriber, null),
      {
        ids: [String(published.id), String(draft.id), String(scheduled.id)],
        scope: POST,
      },
    );
    expect(byId.map((row) => row.id)).toEqual([String(published.id)]);
  });

  test("list() keeps a contributor's own unpublished entries, not a colleague's", async () => {
    // `edit_own` is what a contributor has instead of `edit_any`: their
    // own draft is theirs to pick, and the hidden half has to be the
    // colleague's rather than every unpublished row.
    const h = await createRpcHarness({ authAs: "admin" });
    const contributor = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "contributor" });
    const mine = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: contributor.id, title: "Mine", status: "draft" });
    const theirs = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Theirs", status: "draft" });

    const rows = await entryLookupAdapter.list(
      withUser(h.context, contributor, null),
      { scope: POST, limit: 100 },
    );
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(String(mine.id));
    expect(ids).not.toContain(String(theirs.id));
  });

  test("list() answers a principal-less caller with the published rows of a public type only", async () => {
    // Public nav resolves menu targets through this adapter with no
    // principal at all (`getMenuByName` in plugin-menu), so a viewer
    // holding no capability still has to get the rows the site renders
    // to anyone — and nothing from a type it never renders.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "page",
      toRegisteredEntryType("page", { label: "Pages", isPublic: true }, null),
    );
    registry.entryTypes.set(
      "ledger",
      toRegisteredEntryType(
        "ledger",
        { label: "Ledgers", isPublic: false },
        null,
      ),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const live = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "page", status: "published", authorId: h.user.id });
    const unshipped = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "page", status: "draft", authorId: h.user.id });
    const internal = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "ledger", status: "published", authorId: h.user.id });

    // h.context carries no user — the shape public render arrives in.
    const rows = await entryLookupAdapter.list(h.context, {
      scope: { entryTypes: ["page", "ledger"] },
      limit: 100,
    });
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual([String(live.id)]);
    expect(ids).not.toContain(String(unshipped.id));
    expect(ids).not.toContain(String(internal.id));
  });

  test("list() ORs two viewer rules together without losing the scope filter", async () => {
    // One type resolves through the readable arm and the other through
    // the public arm, so the disjunction carries two operands — the only
    // arity at which `or` precedence against the surrounding `and` can
    // go wrong. A trashed row pins that the scope conditions still bind.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "page",
      toRegisteredEntryType("page", { label: "Pages", isPublic: true }, null),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const contributor = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "contributor" });
    const ownDraft = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "post", status: "draft", authorId: contributor.id });
    const livePage = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "page", status: "published", authorId: h.user.id });
    const draftPage = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "page", status: "draft", authorId: h.user.id });
    const trashedOwn = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "post", status: "trash", authorId: contributor.id });

    const rows = await entryLookupAdapter.list(
      withUser(h.context, contributor, null),
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

  test("list() searches by title (case-insensitive substring)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Alpha Release" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Beta Notes" });

    const matches = await entryLookupAdapter.list(authedCtx(h), {
      query: "alpha",
      scope: POST,
    });
    expect(matches.find((r) => r.label === "Alpha Release")).toBeDefined();
    expect(matches.find((r) => r.label === "Beta Notes")).toBeUndefined();
  });

  test("list() respects the limit cap and clamps pathological values", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    for (let i = 0; i < 5; i++) {
      await entryFactory
        .transient({ db: h.context.db })
        .create({ authorId: h.user.id });
    }
    expect(
      await entryLookupAdapter.list(authedCtx(h), { limit: 2, scope: POST }),
    ).toHaveLength(2);
    const all = await entryLookupAdapter.list(authedCtx(h), {
      limit: 0,
      scope: POST,
    });
    expect(all.length).toBeLessThanOrEqual(20);
  });

  test("list() returns subtitle including type + status", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Released", status: "published" });
    const results = await entryLookupAdapter.list(authedCtx(h), {
      query: "Released",
      scope: POST,
    });
    const row = results.find((r) => r.label === "Released");
    expect(row?.subtitle).toContain("post");
    expect(row?.subtitle).toContain("published");
  });

  test("list({ ids }) returns full lookup result (targetType + href) for a valid in-scope id", async () => {
    // A registered public entry type gives the row a permalink, so
    // this pins the `href` contract too. The single-reference picker
    // resolves its selected id through this same `list({ ids })` path.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "post",
      toRegisteredEntryType("post", { label: "Posts", isPublic: true }, null),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Specific" });
    const [result] = await entryLookupAdapter.list(authedCtx(h), {
      ids: [String(e.id)],
      scope: POST,
      limit: 1,
    });
    expect(result?.id).toBe(String(e.id));
    expect(result?.label).toBe("Specific");
    // Wire-contract pin: every entry adapter row carries `targetType`
    // so the admin picker can cascade through `labels.untitledItem`
    // per type. Drop this field and the admin silently regresses
    // every row's "Untitled" fallback to the generic descriptor.
    expect(result?.targetType).toBe("post");
    // `href` is the public permalink — menu resolution renders links
    // from it at read time.
    expect(result?.href).toBe(`/post/${e.slug}`);
  });

  test("hydrate() resolves ids into entry summaries with permalinks", async () => {
    // Register the public entry type so the summary carries a permalink.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "post",
      toRegisteredEntryType("post", { label: "Posts", isPublic: true }, null),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "Referenced", type: "post" });
    const rows = await entryLookupAdapter.hydrate(authedCtx(h), {
      ids: [String(e.id)],
      scope: POST,
    });
    expect(rows).toEqual([
      {
        id: String(e.id),
        type: "post",
        title: "Referenced",
        slug: e.slug,
        url: `/post/${e.slug}`,
      },
    ]);
  });

  test("hydrate() omits missing, malformed, and out-of-scope ids", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const trashed = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "trash" });
    const rows = await entryLookupAdapter.hydrate(authedCtx(h), {
      ids: [String(post.id), String(trashed.id), "999999", "abc"],
      scope: POST,
    });
    expect(rows.map((row) => row.id)).toEqual([String(post.id)]);
  });

  test("hydrate() honours the entryTypes scope filter", async () => {
    // `list` narrows per type on its own; `hydrate` has only the scope's
    // `in` list, so this is what keeps a referenced id from resolving
    // across into a type the field never declared.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.entryTypes.set(
      "page",
      toRegisteredEntryType("page", { label: "Pages", isPublic: true }, null),
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const page = await entryFactory
      .transient({ db: h.context.db })
      .create({ type: "page", status: "published", authorId: h.user.id });
    const rows = await entryLookupAdapter.hydrate(authedCtx(h), {
      ids: [String(page.id)],
      scope: POST,
    });
    expect(rows).toEqual([]);
  });

  test("hydrate() honours a status scope constraint", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const draft = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "draft" });
    const published = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });
    const rows = await entryLookupAdapter.hydrate(h.context, {
      ids: [String(draft.id), String(published.id)],
      scope: { ...POST, status: "published" },
    });
    expect(rows.map((row) => row.id)).toEqual([String(published.id)]);
  });

  test("hydrate() clamps unpublished entries away from draft-incapable viewers", async () => {
    // Hydration feeds public render and anonymous REST — a referenced
    // draft must stay invisible there (pre-hydration reads exposed
    // only an opaque id). Editors keep seeing drafts, matching the
    // admin picker.
    const registry: MutablePluginRegistry = createPluginRegistry();
    const adminHarness = await createRpcHarness({
      authAs: "admin",
      plugins: registry,
    });
    const draft = await entryFactory
      .transient({ db: adminHarness.context.db })
      .create({
        authorId: adminHarness.user.id,
        type: "post",
        status: "draft",
      });

    const anonymous = await entryLookupAdapter.hydrate(adminHarness.context, {
      ids: [String(draft.id)],
      scope: POST,
    });
    // adminHarness.context is the unauthenticated base context.
    expect(anonymous).toEqual([]);

    const asAdmin = await entryLookupAdapter.hydrate(authedCtx(adminHarness), {
      ids: [String(draft.id)],
      scope: POST,
    });
    expect(asAdmin.map((row) => row.id)).toEqual([String(draft.id)]);
  });

  test("hydrate() maps an empty title to a null summary title", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "   " });
    const rows = await entryLookupAdapter.hydrate(authedCtx(h), {
      ids: [String(e.id)],
      scope: POST,
    });
    expect(rows[0]?.title).toBeNull();
  });

  test("list({ ids }) returns a null label when title is empty so the admin can localize", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const e = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, title: "   " });
    const [result] = await entryLookupAdapter.list(authedCtx(h), {
      ids: [String(e.id)],
      scope: POST,
      limit: 1,
    });
    expect(result?.label).toBeNull();
  });

  test("hydrate() over nested entries costs the same queries however many it holds", async () => {
    const pagesPlugin = definePlugin("pages", (ctx) => {
      ctx.registerEntryType("page", {
        label: "Pages",
        isPublic: true,
        isHierarchical: true,
      });
    });
    const PAGE_SCOPE = { entryTypes: ["page"] } as const;

    // Each child sits under its own parent, so a per-row ancestor walk
    // would add one query per child.
    async function hydrateNestedPages(
      children: number,
    ): Promise<{ readonly queries: number; readonly urls: (string | null)[] }> {
      const { harness, ctx, run, dbQueryCount } = await createTracedContext({
        plugins: [pagesPlugin],
      });
      const author = await harness.factory.user.create();
      const ids: string[] = [];
      for (let i = 0; i < children; i++) {
        const parent = await harness.factory.entry.create({
          type: "page",
          slug: `parent-${String(i)}`,
          title: "Parent",
          status: "published",
          authorId: author.id,
        });
        const child = await harness.factory.entry.create({
          type: "page",
          slug: `child-${String(i)}`,
          title: "Child",
          status: "published",
          authorId: author.id,
          parentId: parent.id,
        });
        ids.push(String(child.id));
      }
      const rows = await run(() =>
        entryLookupAdapter.hydrate(ctx, { ids, scope: PAGE_SCOPE }),
      );
      return { queries: dbQueryCount(), urls: rows.map((row) => row.url) };
    }

    const one = await hydrateNestedPages(1);
    const four = await hydrateNestedPages(4);

    expect(four.urls).toEqual([
      "/page/parent-0/child-0",
      "/page/parent-1/child-1",
      "/page/parent-2/child-2",
      "/page/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });

  test("list({ ids }) over nested entries costs the same queries however many it holds", async () => {
    const pagesPlugin = definePlugin("pages", (ctx) => {
      ctx.registerEntryType("page", {
        label: "Pages",
        isPublic: true,
        isHierarchical: true,
      });
    });
    const PAGE_SCOPE = { entryTypes: ["page"] } as const;

    async function listNestedPages(children: number): Promise<{
      readonly queries: number;
      readonly hrefs: (string | undefined)[];
    }> {
      const { harness, ctx, run, dbQueryCount } = await createTracedContext({
        plugins: [pagesPlugin],
      });
      const author = await harness.factory.user.create();
      const ids: string[] = [];
      for (let i = 0; i < children; i++) {
        const parent = await harness.factory.entry.create({
          type: "page",
          slug: `parent-${String(i)}`,
          title: "Parent",
          status: "published",
          authorId: author.id,
        });
        const child = await harness.factory.entry.create({
          type: "page",
          slug: `child-${String(i)}`,
          title: "Child",
          status: "published",
          authorId: author.id,
          parentId: parent.id,
        });
        ids.push(String(child.id));
      }
      const rows = await run(() =>
        entryLookupAdapter.list(ctx, {
          ids,
          scope: PAGE_SCOPE,
          limit: children,
        }),
      );
      return { queries: dbQueryCount(), hrefs: rows.map((row) => row.href) };
    }

    const one = await listNestedPages(1);
    const four = await listNestedPages(4);

    expect(four.hrefs).toEqual([
      "/page/parent-0/child-0",
      "/page/parent-1/child-1",
      "/page/parent-2/child-2",
      "/page/parent-3/child-3",
    ]);
    expect(one.queries).toBeGreaterThan(0);
    expect(four.queries).toBe(one.queries);
  });
});
