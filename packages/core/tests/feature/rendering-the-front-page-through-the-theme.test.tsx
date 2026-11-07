import { describe, test } from "vitest";

import type { ResolvedEntry } from "../../src/route/contract/resolved-entry.js";
import { entries as entriesTable } from "../../src/db/schema/entries.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entryType,
  fallback,
  frontPage,
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

/** Lists the front page's entries and names the page it is on. */
const frontPageTheme = defineTheme({
  templates: [
    fallback(() => null),
    frontPage(({ data }) => (
      <section data-testid="front-page">
        <ul>
          {data.entries.map((entry: ResolvedEntry) => (
            <li key={entry.id} data-testid={`row-${entry.slug}`}>
              {entry.title}
            </li>
          ))}
        </ul>
        <span data-testid="page">{`page:${String(data.pagination.page)}`}</span>
      </section>
    )),
  ],
});

const site = await testSite({
  plugins: [blogPlugin],
  config: { theme: frontPageTheme },
});

describe("the front page", () => {
  test("renders the front-page template with the latest entries at /", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "latest",
      title: "Latest",
    });

    const page = await site.visit("/");

    page.assertOk().assertSee('data-testid="front-page"').assertSee("Latest");
  });

  test("excludes entries whose type is not registered by any plugin", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "kept",
      title: "Kept",
    });
    // An entry whose type is not registered (e.g. plugin uninstalled).
    await site.factory.published.create({
      type: "ghost",
      slug: "leaked",
      title: "Leaked",
    });

    const page = await site.visit("/");

    page
      .assertSee('data-testid="row-kept"')
      .assertDontSee('data-testid="row-leaked"');
  });

  test("excludes published entries with NULL publishedAt", async () => {
    const author = await site.factory.user.create({ role: "admin" });
    await site.factory.published.create({
      type: "post",
      slug: "kept",
      title: "Kept",
    });
    // Side-step the factory's publishedAt coercion: insert directly so
    // `status: "published"` survives alongside an explicit null timestamp.
    await site.context.db.insert(entriesTable).values({
      type: "post",
      slug: "no-date",
      title: "No Date",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: null,
    });

    const page = await site.visit("/");

    page
      .assertSee('data-testid="row-kept"')
      .assertDontSee('data-testid="row-no-date"');
  });

  test("/page/1 canonical-redirects to the front page", async () => {
    await site.factory.published.create({ type: "post", slug: "p" });

    const page = await site.visit("/page/1");

    page.assertStatus(301).assertRedirect("https://cms.example/");
  });

  test("the front page renders page 1", async () => {
    await site.factory.published.create({ type: "post", slug: "p" });

    const page = await site.visit("/");

    page.assertOk().assertSee("page:1");
  });

  test("/page/0 on the front-page is out-of-range 404", async () => {
    const page = await site.visit("/page/0");

    page.assertNotFound();
  });
});

const mixedPlugin = definePlugin("mixed", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("internal", {
      label: "Internal",
      isPublic: false,
    });
  },
});

const mixedSite = await testSite({
  plugins: [mixedPlugin],
  config: { theme: frontPageTheme },
});

describe("the front page of a site with a non-public entry type", () => {
  test("excludes entries from `isPublic: false` types", async () => {
    await mixedSite.factory.published.create({
      type: "post",
      slug: "public",
      title: "Public",
    });
    await mixedSite.factory.published.create({
      type: "internal",
      slug: "private",
      title: "Private",
    });

    const page = await mixedSite.visit("/");

    page
      .assertSee('data-testid="row-public"')
      .assertDontSee('data-testid="row-private"');
  });
});

/**
 * The `page` entry type auto-generates `/page/:slug`, which would otherwise
 * swallow `/page/1`. The canonical 301 fires ahead of routing, so `/page/1`
 * redirects to the front page rather than resolving the page-entry single "1".
 */
const pagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
  },
});

const pagedSite = await testSite({
  plugins: [blogPlugin, pagesPlugin],
  config: { theme: frontPageTheme },
});

describe("the front page beside a `page` entry type", () => {
  test("/page/1 is canonical-redirected before the `/page/:slug` auto-route can shadow it", async () => {
    await pagedSite.factory.published.create({ type: "post", slug: "p" });

    const page = await pagedSite.visit("/page/1");

    page.assertStatus(301).assertRedirect("https://cms.example/");
  });

  test("the front page it redirects to renders page 1", async () => {
    await pagedSite.factory.published.create({ type: "post", slug: "p" });

    const page = await pagedSite.visit("/");

    page.assertSee("page:1");
  });
});

/**
 * Sharing a priority with blog's `/posts` archive made resolution depend on
 * plugin order, so pages' catch-all could shadow it.
 */
const catchAllPagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      rewrite: { slug: "" },
    });
  },
});
const blogPostsPlugin = definePlugin("blog-posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "posts" },
    });
  },
});

const catchAllSite = await testSite({
  plugins: [catchAllPagesPlugin, blogPostsPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entryType(({ data }) => (
          <span data-testid="archive">{`type:${data.contentType}`}</span>
        )),
      ],
    }),
  },
});

describe("a blog archive beside a pages catch-all", () => {
  test("blog archive at /posts resolves even when a pages plugin's empty-slug catch-all registers first", async () => {
    await catchAllSite.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Hello",
    });

    const page = await catchAllSite.visit("/posts");

    page.assertOk().assertSee("type:post");
  });
});

const homepagePlugin = definePlugin("homepage", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerRewriteRule("/", { kind: "entryType", entryType: "post" });
  },
});

const rewrittenSite = await testSite({
  plugins: [homepagePlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        frontPage(() => <section data-testid="front-page" />),
        entryType(() => <section data-testid="archive" />),
      ],
    }),
  },
});

describe("a plugin's rewrite rule for /", () => {
  test("plugin-registered `/` rewrite rule wins over front-page synthesis", async () => {
    const page = await rewrittenSite.visit("/");

    page
      .assertSee('data-testid="archive"')
      .assertDontSee('data-testid="front-page"');
  });
});

const frontPageFilter = definePlugin("front-page-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.frontPage, (data) => ({
      ...data,
      entries: data.entries.filter(
        (entry: ResolvedEntry) => entry.slug !== "filtered-out",
      ),
    }));
  },
});

const filteredSite = await testSite({
  plugins: [blogPlugin, frontPageFilter],
  config: { theme: frontPageTheme },
});

describe("a render.frontPage filter", () => {
  test("runs render.frontPage filters before the template renders", async () => {
    await filteredSite.factory.published.create({
      type: "post",
      slug: "filtered-out",
      title: "Filtered Out",
    });
    await filteredSite.factory.published.create({
      type: "post",
      slug: "kept-by-filter",
      title: "Kept",
    });

    const page = await filteredSite.visit("/");

    page
      .assertSee('data-testid="row-kept-by-filter"')
      .assertDontSee('data-testid="row-filtered-out"');
  });
});
