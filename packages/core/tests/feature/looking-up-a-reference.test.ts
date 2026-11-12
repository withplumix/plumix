import { describe, expect, test } from "vitest";

import { entryCapability } from "../../src/access/contract/capability.js";
import { ENTRY_STATUSES } from "../../src/db/schema/entries.js";
import { definePlugin } from "../../src/plugin/define.js";
import { photoLookupAdapter } from "../../src/test/photo-lookup.js";
import { testSite } from "../../src/test/site.js";

/** Core alone: its `user`, `entry` and `term` lookup adapters, no entry types. */
const site = await testSite({ plugins: [] });

/** `news` pools onto `post`'s capabilities; `photo` is gated on news editing. */
const newsPhotos = definePlugin("news-photos", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts" });
    ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
    ctx.registerLookupAdapter({
      kind: "photo",
      adapter: photoLookupAdapter,
      capability: entryCapability("news", "edit_any"),
    });
  },
});

const pooledSite = await testSite({ plugins: [newsPhotos] });

describe("looking up a reference", () => {
  test("lists what the kind's adapter matches for the query", async () => {
    await site.factory.user.create({
      email: "alpha@example.test",
      name: "Alpha",
    });
    await site.factory.user.create({
      email: "beta@example.test",
      name: "Beta",
    });

    const result = await site
      .actingAs("admin")
      .rpc.lookup.list({ kind: "user", query: "alpha" });

    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("Alpha");
    expect(labels).not.toContain("Beta");
  });

  test("is not found for a kind no adapter is registered for", async () => {
    const lookup = site.actingAs("admin").rpc.lookup.list({
      kind: "nonexistent",
    });

    await expect(lookup).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("is refused to a visitor", async () => {
    const lookup = site.rpc.lookup.list({ kind: "user" });

    await expect(lookup).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("hands the scope to the adapter", async () => {
    await site.factory.admin.create({ name: "Admin1" });
    await site.factory.author.create({ name: "Author1" });

    const result = await site
      .actingAs("admin")
      .rpc.lookup.list({ kind: "user", scope: { roles: ["admin"] } });

    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("Admin1");
    expect(labels).not.toContain("Author1");
  });
});

describe("looking up users", () => {
  test("is forbidden to a member, who cannot list users", async () => {
    // A picker would otherwise enumerate every email and name on the site.
    await site.factory.user.create({
      email: "leak@example.test",
      name: "Leak Target",
    });

    const lookup = site.actingAs("member").rpc.lookup.list({ kind: "user" });

    await expect(lookup).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("is open to an editor, who can list users", async () => {
    const result = await site
      .actingAs("editor")
      .rpc.lookup.list({ kind: "user", limit: 1 });

    expect(result.items).toBeDefined();
  });
});

describe("looking up entries as a member", () => {
  // The entry adapter is ungated and a member is public-reachable under
  // `auth.selfSignup`, so the caller-supplied scope is the whole gate.
  test("offers published entries but not drafts", async () => {
    const author = await site.factory.admin.create();
    const draft = await site.factory.entry.create({
      authorId: author.id,
      title: "Embargoed",
      status: "draft",
    });
    const published = await site.factory.entry.create({
      authorId: author.id,
      title: "Live",
      status: "published",
    });

    const result = await site.actingAs("member").rpc.lookup.list({
      kind: "entry",
      scope: { entryTypes: ["post"] },
    });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(String(published.id));
    expect(ids).not.toContain(String(draft.id));
  });

  test("is refused a scope naming autosaves", async () => {
    // An autosave row carries another user's unsaved title.
    const lookup = site.actingAs("member").rpc.lookup.list({
      kind: "entry",
      scope: { entryTypes: ["autosave"] },
    });

    await expect(lookup).rejects.toThrow();
  });
});

describe("a lookup gated on an entry type's capability", () => {
  test("is open to an editor of the namespace the type pools into", async () => {
    const result = await pooledSite
      .actingAs("editor")
      .rpc.lookup.list({ kind: "photo" });

    expect(result.items).toEqual([]);
  });

  test("is forbidden to an author, naming the pooled capability", async () => {
    const lookup = pooledSite
      .actingAs("author")
      .rpc.lookup.list({ kind: "photo" });

    await expect(lookup).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:edit_any" },
    });
  });
});

/**
 * A public and a private entry type, a taxonomy only editors read, and a
 * plugin kind gated on a capability.
 */
const catalog = definePlugin("catalog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("note", { label: "Notes" });
    ctx.registerTermTaxonomy("category", { label: "Categories" });
    ctx.registerTermTaxonomy("tag", { label: "Tags" });
    ctx.registerTermTaxonomy("desk", {
      label: "Desks",
      capabilities: { read: ["editor"] },
    });
    ctx.registerLookupAdapter({
      kind: "photo",
      adapter: photoLookupAdapter,
      capability: entryCapability("post", "edit_any"),
    });
  },
});

const catalogSite = await testSite({ plugins: [catalog] });

/** Calls a procedure over the wire; `null` when it refuses the caller. */
type Rpc = (path: string, input: unknown) => Promise<unknown>;

function rpcOver(
  visit: typeof catalogSite.visit,
  headers: Record<string, string> = {},
): Rpc {
  return async (path, input) => {
    const page = await visit(`/_plumix/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ json: input }),
    });
    return page.status === 200
      ? (JSON.parse(page.body) as { json: unknown }).json
      : null;
  };
}

const callers = [
  {
    caller: "a visitor",
    rpcFor: () => Promise.resolve(rpcOver(catalogSite.visit)),
  },
  {
    caller: "a member",
    rpcFor: () =>
      Promise.resolve(rpcOver(catalogSite.actingAs("member").visit)),
  },
  {
    caller: "an admin's token scoped to tags",
    rpcFor: async () => {
      const admin = await catalogSite.factory.admin.create();
      const { secret } = await catalogSite.factory.apiToken.create({
        userId: admin.id,
        scopes: ["term:tag:read"],
      });
      return rpcOver(catalogSite.visit, { authorization: `Bearer ${secret}` });
    },
  },
] as const;

function idsOf(rows: unknown): string[] {
  return Array.isArray(rows)
    ? rows.map((row: { readonly id: number | string }) => String(row.id))
    : [];
}

/** One slice of an ungated kind, and what its list procedure shows of it. */
interface Slice {
  readonly slice: string;
  readonly kind: string;
  readonly scope: Record<string, unknown>;
  readonly seed: () => Promise<unknown>;
  readonly listed: (rpc: Rpc) => Promise<string[]>;
}

const registry = catalogSite.context.plugins;

const slicesByKind: Record<string, () => Slice[]> = {
  term: () =>
    [...registry.termTaxonomies.keys()].map((taxonomy) => ({
      slice: `${taxonomy} terms`,
      kind: "term",
      scope: { termTaxonomies: [taxonomy] },
      seed: () => catalogSite.factory.term.create({ taxonomy }),
      listed: async (rpc) =>
        idsOf(await rpc("term/list", { taxonomy, limit: 200 })),
    })),
  entry: () =>
    [...registry.entryTypes.keys()].map((type) => ({
      slice: `${type} entries`,
      kind: "entry",
      scope: { entryTypes: [type] },
      seed: () =>
        Promise.all([
          catalogSite.factory.entry.create({ type, status: "published" }),
          catalogSite.factory.entry.create({ type, status: "draft" }),
        ]),
      // Per status, since one the caller can't read empties a mixed list.
      listed: async (rpc) =>
        (
          await Promise.all(
            ENTRY_STATUSES.map((status) =>
              rpc("entry/list", { type, status, limit: 100 }),
            ),
          )
        ).flatMap(idsOf),
    })),
};

const adapters = [...registry.lookupAdapters.values()];
const ungatedKinds = adapters
  .filter((registered) => registered.capability === null)
  .map((registered) => registered.kind);
const slices = ungatedKinds.flatMap((kind) => slicesByKind[kind]?.() ?? []);
const gated = adapters.flatMap(({ kind, capability }) =>
  capability === null ? [] : [{ kind, capability }],
);

describe("a lookup and its kind's list procedure", () => {
  test("cover every ungated kind registered", () => {
    expect(ungatedKinds.sort()).toEqual(Object.keys(slicesByKind).sort());
  });

  test.each(
    callers.flatMap((caller) => slices.map((s) => ({ ...caller, ...s }))),
  )(
    "offer $caller no $slice the list procedure refuses",
    async ({ rpcFor, kind, scope, seed, listed }) => {
      await seed();
      const rpc = await rpcFor();

      const looked = (await rpc("lookup/list", {
        kind,
        scope,
        limit: 100,
      })) as {
        readonly items: unknown;
      } | null;

      expect(await listed(rpc)).toEqual(
        expect.arrayContaining(idsOf(looked?.items)),
      );
    },
  );

  test.each(
    callers.flatMap((caller) => gated.map((g) => ({ ...caller, ...g }))),
  )(
    "refuse $caller the $kind lookup, gated on a capability it lacks",
    async ({ rpcFor, kind }) => {
      const rpc = await rpcFor();

      expect(await rpc("lookup/list", { kind })).toBeNull();
    },
  );
});
