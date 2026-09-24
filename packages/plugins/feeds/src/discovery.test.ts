import type { DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import { feeds } from "./index.js";

// Discovery reads the archive that owns the page from core's archive lookup,
// so each page here is rendered for real rather than handed in as a payload.
const host = definePlugin("feeds-discovery-host", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: "news",
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    entryTypes: ["post"],
  });
  ctx.registerTermTaxonomy("region", {
    label: "Regions",
    entryTypes: ["post"],
    isHierarchical: true,
  });
});

async function seeded(
  options: { readonly basePath?: string } = {},
): Promise<DispatcherHarness> {
  const h = await createDispatcherHarness({
    ...options,
    plugins: [host, feeds()],
  });
  const jane = await h.factory.author.create({ name: "Jane", slug: "jane" });
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    content: null,
    status: "published",
    authorId: jane.id,
    publishedAt: new Date("2026-07-21T12:00:00Z"),
  });
  await h.factory.category.create({ slug: "news", name: "News" });
  const europe = await h.factory.term.create({
    taxonomy: "region",
    slug: "europe",
    name: "Europe",
  });
  await h.factory.term.create({
    taxonomy: "region",
    slug: "france",
    name: "France",
    parentId: europe.id,
  });
  return h;
}

// The `<link rel="alternate">` hrefs a rendered page advertises.
async function advertised(
  h: DispatcherHarness,
  path: string,
  status = 200,
): Promise<readonly (string | undefined)[]> {
  const res = await h.fetch(path);
  res.assertStatus(status);
  const body = await res.text();
  return [...body.matchAll(/<link[^>]*rel="alternate"[^>]*>/g)].map(
    ([tag]) => /href="([^"]*)"/.exec(tag)?.[1],
  );
}

describe("feed discovery", () => {
  test.each([
    ["the front page", "/", "/feed"],
    ["a type archive, at its hasArchive slug", "/news", "/news/feed"],
    ["a term", "/category/news", "/category/news/feed"],
    ["a nested term", "/region/europe/france", "/region/europe/france/feed"],
    ["an author", "/authors/jane", "/authors/jane/feed"],
    ["a date period", "/2026/07", "/2026/07/feed"],
  ])("%s advertises its own feed", async (_page, path, feed) => {
    const h = await seeded();
    expect(await advertised(h, path)).toEqual([
      `https://cms.example${feed}`,
      `https://cms.example${feed}/atom`,
    ]);
  });

  test("the advertised feed carries the base prefix", async () => {
    const h = await seeded({ basePath: "/custom-directory" });
    expect(await advertised(h, "/custom-directory/news")).toEqual([
      "https://cms.example/custom-directory/news/feed",
      "https://cms.example/custom-directory/news/feed/atom",
    ]);
  });

  test.each([
    ["a single entry", "/post/hello", 200],
    ["the search page", "/search/hello", 200],
    ["a missing term at an archive's URL", "/category/ghost", 404],
  ])("%s advertises nothing", async (_page, path, status) => {
    const h = await seeded();
    expect(await advertised(h, path, status)).toEqual([]);
  });

  test("a private site advertises nothing on a page that would otherwise have a feed", async () => {
    const h = await seeded();
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });
    expect(await advertised(h, "/news")).toEqual([]);
  });
});
