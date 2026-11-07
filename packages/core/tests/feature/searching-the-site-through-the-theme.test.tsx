import { describe, test } from "vitest";

import type { ResolvedEntry } from "../../src/route/contract/resolved-entry.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  fallback,
  search,
} from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

/**
 * Lists each hit, and names the query and the page it is on, beside an entry
 * template for the single a `?s=` must not hijack.
 */
const searchTheme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) => (
      <article data-testid={`post-${data.entry.slug}`}>
        {data.entry.title}
      </article>
    )),
    search(({ data }) => (
      <section data-testid="search">
        <span data-testid="q">{`q:[${data.query}]`}</span>
        <span data-testid="page">{`page:${String(data.pagination.page)};entries:${String(data.entries.length)}`}</span>
        <ul>
          {data.entries.map((entry: ResolvedEntry) => (
            <li key={entry.id} data-testid={`hit-${entry.slug}`}>
              {entry.title}
            </li>
          ))}
        </ul>
      </section>
    )),
  ],
});

const site = await testSite({
  plugins: [blogPlugin],
  config: { theme: searchTheme },
});

describe("searching the site", () => {
  test("/search/<query> renders the `search` template with the query in scope", async () => {
    const page = await site.visit("/search/hello");

    page.assertOk().assertSee('data-testid="search"').assertSee("q:[hello]");
  });

  test("search results filter entries whose title matches the query", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "matches",
      title: "Hello world",
    });
    await site.factory.published.create({
      type: "post",
      slug: "no-match",
      title: "Unrelated",
    });

    const page = await site.visit("/search/hello");

    page
      .assertSee('data-testid="hit-matches"')
      .assertDontSee('data-testid="hit-no-match"');
  });

  test("/search/<q>/page/N paginates the search results", async () => {
    // 25 matches, default per-page 20 → page 2 has 5 entries
    await site.factory.published.createList(25, {
      type: "post",
      title: "Hello",
    });

    const page = await site.visit("/search/hello/page/2");

    page.assertOk().assertSee("page:2;entries:5");
  });

  test("/search (no query) renders the empty-search state", async () => {
    const page = await site.visit("/search");

    page.assertOk().assertSee('data-testid="search"').assertSee("q:[]");
  });

  test("?s= on a non-search URL stays on the original route (no hijack)", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "about",
      title: "About",
    });

    const page = await site.visit("/post/about?s=hello");

    page
      .assertSee('data-testid="post-about"')
      .assertDontSee('data-testid="search"');
  });

  test("search results match a phrase in the entry excerpt", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "excerpt-match",
      title: "Unrelated title",
      excerpt: "An opening paragraph about hello world.",
    });
    await site.factory.published.create({
      type: "post",
      slug: "no-match",
      title: "Nothing here",
      excerpt: "Nothing here either.",
    });

    const page = await site.visit("/search/hello");

    page
      .assertSee('data-testid="hit-excerpt-match"')
      .assertDontSee('data-testid="hit-no-match"');
  });

  // The excerpt clause is an OR, so it has to stay inside the published-only
  // filter rather than reassociating past it.
  test("an excerpt match on an unpublished entry stays out of the results", async () => {
    await site.factory.draft.create({
      type: "post",
      slug: "draft-excerpt",
      title: "Draft",
      excerpt: "A hello world draft.",
    });
    await site.factory.published.create({
      type: "post",
      slug: "published-excerpt",
      title: "Published",
      excerpt: "A hello world post.",
    });

    const page = await site.visit("/search/hello");

    page
      .assertOk()
      .assertSee('data-testid="hit-published-excerpt"')
      .assertDontSee('data-testid="hit-draft-excerpt"');
  });

  test("URL-encoded query is decoded before matching and rendering", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "spaced",
      title: "hello world post",
    });

    const page = await site.visit("/search/hello%20world");

    page.assertSee("q:[hello world]");
  });

  test("`_` in the query matches the literal character, not any-single-char", async () => {
    // Without escaping, SQLite LIKE treats `_` as a wildcard — a query of
    // `_` would match every entry. The framework escapes user wildcards.
    await site.factory.published.create({
      type: "post",
      slug: "literal-underscore",
      title: "snake_case naming",
    });
    await site.factory.published.create({
      type: "post",
      slug: "underscore-excerpt",
      title: "Plain title",
      excerpt: "About snake_case naming",
    });
    await site.factory.published.create({
      type: "post",
      slug: "plain",
      title: "Plain title",
      excerpt: "No wildcards here",
    });

    const page = await site.visit("/search/_");

    page
      .assertSee('data-testid="hit-literal-underscore"')
      .assertSee('data-testid="hit-underscore-excerpt"')
      .assertDontSee('data-testid="hit-plain"');
  });

  test("/search/<q>/page/N returns 404 when N is out of range", async () => {
    const page = await site.visit("/search/anything/page/99");

    page.assertNotFound();
  });
});

const mediaPlugin = definePlugin("media", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("attachment", {
      label: "Media",
      isPublic: true,
      excludeFromSearch: true,
    });
  },
});

const mediaSite = await testSite({
  plugins: [mediaPlugin],
  config: { theme: searchTheme },
});

describe("searching a site with an entry type left out of search", () => {
  test("entry types flagged excludeFromSearch don't appear in search hits", async () => {
    await mediaSite.factory.published.create({
      type: "post",
      slug: "hello-post",
      title: "Hello post",
    });
    await mediaSite.factory.published.create({
      type: "attachment",
      slug: "hello-media",
      title: "Hello media",
    });

    const page = await mediaSite.visit("/search/hello");

    page
      .assertSee('data-testid="hit-hello-post"')
      .assertDontSee('data-testid="hit-hello-media"');
  });
});

const searchFilter = definePlugin("search-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.search, (data) => ({
      ...data,
      query: `filtered:${data.query}`,
    }));
  },
});

const filteredSite = await testSite({
  plugins: [blogPlugin, searchFilter],
  config: { theme: searchTheme },
});

describe("a render.search filter", () => {
  test("runs render.search filters before the search template renders", async () => {
    const page = await filteredSite.visit("/search/hello");

    page.assertSee("q:[filtered:hello]");
  });
});
