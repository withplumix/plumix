import { describe, expect, test } from "vitest";

import { deriveTermTaxonomyCapabilities } from "../../../auth/rbac.js";
import { entries } from "../../../db/schema/entries.js";
import { terms } from "../../../db/schema/terms.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { registerCoreSearchHandlers } from "../../../search/register-core-handlers.js";
import { createRpcHarness } from "../../../test/rpc.js";

type Harness = Awaited<ReturnType<typeof createRpcHarness>>;

// Spin up a harness with a `post` entry type + a `category` taxonomy +
// the core search handlers wired on (the harness boots none). `post` caps
// are core; the taxonomy's are derived at registration, so we populate
// them the way `registerTermTaxonomy` would. Mirrors `createPlumixApp`.
async function searchHarness(authAs: "editor" | "author"): Promise<Harness> {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set("post", {
    label: { id: "et.post", message: "Posts" },
    labels: { plural: { id: "et.post.plural", message: "Posts" } },
    registeredBy: null,
  } as never);
  const categorySpec = {
    label: { id: "tt.category", message: "Categories" },
    labels: { plural: { id: "tt.category.plural", message: "Categories" } },
    registeredBy: null,
  };
  plugins.termTaxonomies.set("category", categorySpec as never);
  for (const cap of deriveTermTaxonomyCapabilities("category", categorySpec)) {
    plugins.capabilities.set(cap.name, { ...cap, registeredBy: null });
  }
  const h = await createRpcHarness({ authAs, plugins });
  registerCoreSearchHandlers(h.hooks);
  return h;
}

async function seedTerm(h: Harness, name: string, slug: string): Promise<void> {
  await h.context.db.insert(terms).values({ taxonomy: "category", name, slug });
}

async function seed(
  h: Harness,
  values: {
    title: string;
    slug: string;
    status: "published" | "draft" | "trash";
  },
): Promise<void> {
  const author = h.user;
  if (!author) throw new Error("harness has no authenticated user");
  await h.context.db
    .insert(entries)
    .values({ type: "post", authorId: author.id, ...values });
}

describe("search.query", () => {
  test("groups matching entries by type and matches title", async () => {
    const h = await searchHarness("editor");
    await seed(h, { title: "Hello World", slug: "hello", status: "published" });
    await seed(h, { title: "Unrelated", slug: "other", status: "published" });

    const groups = await h.client.search.query({ query: "hello" });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "entry:post",
        items: [expect.objectContaining({ title: "Hello World" })],
      }),
    ]);
  });

  test("editor sees draft matches", async () => {
    const h = await searchHarness("editor");
    await seed(h, { title: "Hidden Draft", slug: "d1", status: "draft" });

    const groups = await h.client.search.query({ query: "hidden" });

    expect(groups[0]?.items).toEqual([
      expect.objectContaining({ title: "Hidden Draft" }),
    ]);
  });

  test("an author sees their own draft (mirrors entry read rules)", async () => {
    const h = await searchHarness("author");
    await seed(h, { title: "My Own Draft", slug: "d2", status: "draft" });

    const groups = await h.client.search.query({ query: "own" });

    expect(groups[0]?.items).toEqual([
      expect.objectContaining({ title: "My Own Draft" }),
    ]);
  });

  test("trash entries are excluded even for editors", async () => {
    const h = await searchHarness("editor");
    await seed(h, { title: "Trashed Item", slug: "t1", status: "trash" });

    expect(await h.client.search.query({ query: "trashed" })).toEqual([]);
  });

  test("returns nothing for an empty query", async () => {
    const h = await searchHarness("editor");
    await seed(h, { title: "Hello", slug: "h", status: "published" });

    expect(await h.client.search.query({ query: "  " })).toEqual([]);
  });

  test("groups matching terms by taxonomy", async () => {
    const h = await searchHarness("editor");
    await seedTerm(h, "News", "news");
    await seedTerm(h, "Unrelated", "unrelated");

    const groups = await h.client.search.query({ query: "news" });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "term:category",
        items: [expect.objectContaining({ title: "News" })],
      }),
    ]);
  });
});
