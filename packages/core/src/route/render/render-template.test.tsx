// `TemplateData = any` (foundation placeholder) makes destructured
// template props unsafe by eslint's rules. Templates here exercise
// behavior, not type ergonomics — narrowing each access would obscure
// the assertions. The follow-up that lands the discriminated TemplateData
// union also drops these blanket disables.
/* eslint-disable @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call */

import { describe, expect, test } from "vitest";

import type { EntryContent } from "@plumix/blocks";
import { BlockRenderer } from "@plumix/blocks/renderer";

import type { ResolvedEntry } from "./resolved-entry.js";
import { entries as entriesTable } from "../../db/schema/entries.js";
import { definePlugin } from "../../plugin/define.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { defineTheme } from "../../theme.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

describe("resolvePublicRoute — single entry through theme", () => {
  test("renders the entry title via the matched `single` template", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <h1 data-testid="title">{data.entry.title}</h1>,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hello"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="title"');
    expect(body).toContain("Hello");
  });

  test("falls through to `index` template when no `single` is registered", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <article data-testid="index">{data.entry.title}</article>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "fallback",
      title: "Fallback",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/fallback"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="index"');
    expect(body).toContain("Fallback");
  });

  test("more-specific keys win: single-{type} > single > index", async () => {
    const theme = defineTheme({
      templates: {
        index: () => <div data-testid="index" />,
        single: () => <div data-testid="single" />,
        "single-post": () => <div data-testid="single-post" />,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "specific",
      title: "Specific",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/specific"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="single-post"');
    expect(body).not.toContain('data-testid="single"');
  });

  test("runs resolve:single:data filters before the template renders", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => <h1>{data.entry.title}</h1>,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "filtered",
      title: "Original",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    h.app.hooks.addFilter(
      "resolve:single:data",
      (data) => ({
        ...data,
        entry: { ...data.entry, title: "Filtered" },
      }),
      { plugin: "test" },
    );

    const response = await h.dispatch(
      new Request("https://cms.example/post/filtered"),
    );
    const body = await response.text();
    expect(body).toContain("Filtered");
    expect(body).not.toContain("Original");
  });

  test("template receives ResolvedAuthor with public-safe fields", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <p data-testid="author">{data.entry.author.name}</p>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.factory.user.create({
      email: "byline-author@example.test",
      name: "Eve Author",
      role: "admin",
    });
    await h.factory.entry.create({
      type: "post",
      slug: "with-byline",
      title: "Byline",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/with-byline"),
    );
    const body = await response.text();
    expect(body).toContain("Eve Author");
    expect(body).not.toContain("byline-author@example.test");
  });

  test("template receives eager-loaded terms in batched order", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <span data-testid="terms">{`terms:${String(data.entry.terms.length)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    const entry = await h.factory.entry.create({
      type: "post",
      slug: "tagged",
      title: "Tagged",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const a = await h.factory.term.create({
      taxonomy: "category",
      slug: "alpha",
      name: "Alpha",
    });
    const b = await h.factory.term.create({
      taxonomy: "category",
      slug: "beta",
      name: "Beta",
    });
    await h.factory.entryTerm.create({
      entryId: entry.id,
      termId: a.id,
      sortOrder: 0,
    });
    await h.factory.entryTerm.create({
      entryId: entry.id,
      termId: b.id,
      sortOrder: 1,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/tagged"),
    );
    const body = await response.text();
    expect(body).toContain("terms:2");
  });

  test("default document shell supplies doctype + html/head/body with charset, viewport, and title", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => <article>{data.entry.title}</article>,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "doc",
      title: "DocTitle",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/doc"),
    );
    const body = await response.text();
    expect(body).toContain("<!doctype html>");
    expect(body).toContain('<html lang="en">');
    expect(body).toContain('<meta charSet="utf-8"/>');
    expect(body).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    );
    expect(body).toContain("<title>DocTitle</title>");
    expect(body).toContain("<body>");
  });

  test("theme `document` override replaces the default shell", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: ({ children }) => (
        <html lang="fr">
          <head>
            <title>custom-doc</title>
          </head>
          <body className="branded">{children}</body>
        </html>
      ),
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "doc-override",
      title: "Doc",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/doc-override"),
    );
    const body = await response.text();
    expect(body).toContain('<html lang="fr">');
    expect(body).toContain('class="branded"');
    expect(body).toContain("custom-doc");
  });

  test("`document` override renders children between header and footer", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <div data-testid="template-payload">{data.entry.title}</div>
        ),
      },
      document: ({ children }) => (
        <html lang="en">
          <head>
            <title>doc</title>
          </head>
          <body>
            <header>chrome-before</header>
            {children}
            <footer>chrome-after</footer>
          </body>
        </html>
      ),
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "positioned",
      title: "Positioned",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/positioned"),
    );
    const body = await response.text();
    expect(body).toMatch(
      /chrome-before[\s\S]*data-testid="template-payload"[\s\S]*chrome-after/,
    );
  });

  test("react 19 metadata hoisting: template-rendered <title> lands in <head>", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <>
            <title>From-Template</title>
            <article>{data.entry.title}</article>
          </>
        ),
      },
      document: ({ children }) => (
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
          </head>
          <body>{children}</body>
        </html>
      ),
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hoisting",
      title: "Body",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hoisting"),
    );
    const body = await response.text();
    // React 19 hoists <title> rendered in the body tree into <head>.
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toContain("<title>From-Template</title>");
  });

  test("template can render <BlockRenderer/> against the entry's content tree", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) =>
          data.entry.content ? (
            <BlockRenderer content={data.entry.content as EntryContent} />
          ) : null,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "with-blocks",
      title: "Blocks",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "h", name: "core/heading", attrs: { text: "Hi" } }],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/with-blocks"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Hi");
    expect(body).toContain('data-plumix-block="core/heading"');
  });
});

describe("resolvePublicRoute — archive through theme", () => {
  test("renders the archive template with the seeded entries listed", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <ul data-testid="archive">
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`entry-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "first",
      title: "First",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-05-01"),
    });
    await h.factory.entry.create({
      type: "post",
      slug: "second",
      title: "Second",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-05-02"),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="archive"');
    expect(body).toContain("First");
    expect(body).toContain("Second");
  });

  test("excludes published entries with NULL publishedAt from the archive", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`entry-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.db.insert(entriesTable).values({
      type: "post",
      slug: "no-date",
      title: "No Date",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: null,
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain('data-testid="entry-kept"');
    expect(body).not.toContain('data-testid="entry-no-date"');
  });

  test("template receives the pagination shape { page, perPage, total, pageCount }", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <span data-testid="pagination">
            {`page:${String(data.pagination.page)};perPage:${String(data.pagination.perPage)};total:${String(data.pagination.total)};pageCount:${String(data.pagination.pageCount)}`}
          </span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "p1",
      title: "P1",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entry.create({
      type: "post",
      slug: "p2",
      title: "P2",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain("page:1;perPage:20;total:2;pageCount:1");
  });

  test("/post/page/2 renders page 2 of entries", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <span data-testid="page">{`page:${String(data.pagination.page)};entries:${String(data.entries.length)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    // Seed 25 entries; ARCHIVE_LIMIT is 20 so page 2 has 5.
    for (let i = 0; i < 25; i++) {
      await h.factory.entry.create({
        type: "post",
        slug: `p-${String(i)}`,
        title: `P${String(i)}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(2026, 4, i + 1),
      });
    }

    const response = await h.dispatch(
      new Request("https://cms.example/post/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("page:2;entries:5");
  });

  test("archive-{type} specificity wins over `archive` and `index`", async () => {
    const theme = defineTheme({
      templates: {
        index: () => <div data-testid="index" />,
        archive: () => <div data-testid="archive" />,
        "archive-post": () => <div data-testid="archive-post" />,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "spec",
      title: "Spec",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain('data-testid="archive-post"');
    expect(body).not.toContain('data-testid="archive"');
  });

  test("falls through to `index` template when `archive` is not registered", async () => {
    const theme = defineTheme({
      templates: {
        index: ({ data }) => (
          <span data-testid="index-fallback">
            {`entries:${String("entries" in data ? data.entries.length : 0)}`}
          </span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "fallback",
      title: "Fallback",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain('data-testid="index-fallback"');
    expect(body).toContain("entries:1");
  });

  test("runs resolve:archive:data filters before the template renders", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => <span data-testid="ct">{data.contentType}</span>,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "x",
      title: "X",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    h.app.hooks.addFilter(
      "resolve:archive:data",
      (data) => ({ ...data, contentType: "filtered" }),
      { plugin: "test" },
    );

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain(">filtered<");
  });

  test("each entry in the archive carries its eager-loaded author + terms", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                <span data-testid="author">{entry.author.name}</span>
                <span data-testid="terms">{`terms:${String(entry.terms.length)}`}</span>
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const writer = await h.factory.user.create({
      email: "ada@example.test",
      name: "Ada Author",
      role: "admin",
    });
    const entry = await h.factory.entry.create({
      type: "post",
      slug: "eager",
      title: "Eager",
      content: null,
      status: "published",
      authorId: writer.id,
      publishedAt: new Date(),
    });
    const tag = await h.factory.term.create({
      taxonomy: "tag",
      slug: "alpha",
      name: "Alpha",
    });
    await h.factory.entryTerm.create({
      entryId: entry.id,
      termId: tag.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain("Ada Author");
    expect(body).toContain("terms:1");
    expect(body).not.toContain("ada@example.test");
  });
});

const topicPlugin = definePlugin("blog-topic", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerTermTaxonomy("topic", {
    label: "Topics",
    labels: { singular: "Topic" },
    entryTypes: ["post"],
    isHierarchical: false,
  });
});

const categoryPlugin = definePlugin("blog-category", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    labels: { singular: "Category" },
    entryTypes: ["post"],
    isHierarchical: false,
  });
  ctx.registerTermTaxonomy("tag", {
    label: "Tags",
    labels: { singular: "Tag" },
    entryTypes: ["post"],
    isHierarchical: false,
  });
});

describe("resolvePublicRoute — taxonomy through theme", () => {
  test("renders the taxonomy template with the term + its entries", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <section data-testid="taxonomy">
            <h1 data-testid="term-name">{data.term.name}</h1>
            <ul>
              {data.entries.map((entry: ResolvedEntry) => (
                <li key={entry.id}>{entry.title}</li>
              ))}
            </ul>
          </section>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [topicPlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const a = await h.factory.entry.create({
      type: "post",
      slug: "story-a",
      title: "Story A",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({
      entryId: a.id,
      termId: term.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/topic/news"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="taxonomy"');
    expect(body).toContain('data-testid="term-name"');
    expect(body).toContain("News");
    expect(body).toContain("Story A");
  });

  test("excludes published entries with NULL publishedAt from the term archive", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`entry-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [topicPlugin], theme });
    const author = await h.seedUser("admin");
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const kept = await h.factory.entry.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const [nullDated] = await h.db
      .insert(entriesTable)
      .values({
        type: "post",
        slug: "no-date",
        title: "No Date",
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: null,
      })
      .returning();
    if (!nullDated) throw new Error("insert returned no row");
    await h.factory.entryTerm.create({
      entryId: kept.id,
      termId: term.id,
      sortOrder: 0,
    });
    await h.factory.entryTerm.create({
      entryId: nullDated.id,
      termId: term.id,
      sortOrder: 1,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/topic/news"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="entry-kept"');
    expect(body).not.toContain('data-testid="entry-no-date"');
  });

  test("renders built-in `category` template via the category-* hierarchy", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        category: ({ data }) => (
          <div data-testid="category">{data.term.name}</div>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [categoryPlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    const cat = await h.factory.term.create({
      taxonomy: "category",
      slug: "biz",
      name: "Biz",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "biz-1",
      title: "Biz 1",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({
      entryId: post.id,
      termId: cat.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/category/biz"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="category"');
    expect(body).toContain("Biz");
  });

  test("/topic/{slug}/page/2 renders page 2 of entries", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <span data-testid="page">{`page:${String(data.pagination.page)};entries:${String(data.entries.length)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [topicPlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "page-tax",
      name: "PageTax",
    });
    for (let i = 0; i < 22; i++) {
      const e = await h.factory.entry.create({
        type: "post",
        slug: `e-${String(i)}`,
        title: `E${String(i)}`,
        content: null,
        status: "published",
        authorId: author.id,
        publishedAt: new Date(2026, 4, i + 1),
      });
      await h.factory.entryTerm.create({
        entryId: e.id,
        termId: term.id,
        sortOrder: i,
      });
    }

    const response = await h.dispatch(
      new Request("https://cms.example/topic/page-tax/page/2"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("page:2;entries:2");
  });

  test("runs resolve:term:data filters before the template renders", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <span data-testid="name">{data.term.name}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [topicPlugin],
      theme,
    });
    await h.factory.term.create({
      taxonomy: "topic",
      slug: "filtered",
      name: "Original",
    });

    h.app.hooks.addFilter(
      "resolve:term:data",
      (data) => ({
        ...data,
        term: { ...data.term, name: "Filtered" },
      }),
      { plugin: "test" },
    );

    const response = await h.dispatch(
      new Request("https://cms.example/topic/filtered"),
    );
    const body = await response.text();
    expect(body).toContain("Filtered");
    expect(body).not.toContain("Original");
  });

  test("each entry in the taxonomy carries eager-loaded author + terms", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id}>
                <span data-testid="author">{entry.author.name}</span>
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [topicPlugin],
      theme,
    });
    const writer = await h.factory.user.create({
      email: "secret@example.test",
      name: "Public Writer",
      role: "admin",
    });
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "eager",
      name: "Eager",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "p",
      title: "P",
      content: null,
      status: "published",
      authorId: writer.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({
      entryId: post.id,
      termId: term.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/topic/eager"),
    );
    const body = await response.text();
    expect(body).toContain("Public Writer");
    expect(body).not.toContain("secret@example.test");
  });

  test("built-in `tag` template via the tag-* hierarchy mirrors `category`", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        tag: ({ data }) => <div data-testid="tag">{data.term.name}</div>,
      },
    });

    const h = await createDispatcherHarness({
      plugins: [categoryPlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    const t = await h.factory.term.create({
      taxonomy: "tag",
      slug: "feature",
      name: "Feature",
    });
    const post = await h.factory.entry.create({
      type: "post",
      slug: "tagged",
      title: "Tagged",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({
      entryId: post.id,
      termId: t.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/tag/feature"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="tag"');
    expect(body).toContain("Feature");
  });
});

describe("resolvePublicRoute — front-page through theme", () => {
  test("renders the front-page template with the latest entries at /", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <section data-testid="front-page">
            <ul>
              {data.entries.map((entry: ResolvedEntry) => (
                <li key={entry.id} data-testid={`row-${entry.slug}`}>
                  {entry.title}
                </li>
              ))}
            </ul>
          </section>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "latest",
      title: "Latest",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="front-page"');
    expect(body).toContain("Latest");
  });

  test("excludes entries whose type is not registered by any plugin", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    // An entry whose type is not registered (e.g. plugin uninstalled).
    await h.factory.entry.create({
      type: "ghost",
      slug: "leaked",
      title: "Leaked",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    const body = await response.text();
    expect(body).toContain('data-testid="row-kept"');
    expect(body).not.toContain('data-testid="row-leaked"');
  });

  test("excludes entries from `isPublic: false` types", async () => {
    const mixedPlugin = definePlugin("mixed", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerEntryType("internal", { label: "Internal", isPublic: false });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [mixedPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "public",
      title: "Public",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entry.create({
      type: "internal",
      slug: "private",
      title: "Private",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    const body = await response.text();
    expect(body).toContain('data-testid="row-public"');
    expect(body).not.toContain('data-testid="row-private"');
  });

  test("excludes published entries with NULL publishedAt", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "kept",
      title: "Kept",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    // Side-step the factory's publishedAt coercion: insert directly so
    // `status: "published"` survives alongside an explicit null timestamp.
    await h.db.insert(entriesTable).values({
      type: "post",
      slug: "no-date",
      title: "No Date",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: null,
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    const body = await response.text();
    expect(body).toContain('data-testid="row-kept"');
    expect(body).not.toContain('data-testid="row-no-date"');
  });

  test("plugin-registered `/` rewrite rule wins over front-page synthesis", async () => {
    const homepagePlugin = definePlugin("homepage", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts", isPublic: true });
      ctx.registerRewriteRule("/", { kind: "archive", entryType: "post" });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": () => <section data-testid="front-page" />,
        archive: () => <section data-testid="archive" />,
      },
    });

    const h = await createDispatcherHarness({
      plugins: [homepagePlugin],
      theme,
    });
    const response = await h.dispatch(new Request("https://cms.example/"));
    const body = await response.text();
    expect(body).toContain('data-testid="archive"');
    expect(body).not.toContain('data-testid="front-page"');
  });

  test("runs resolve:front-page:data filters before the template renders", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id} data-testid={`row-${entry.slug}`}>
                {entry.title}
              </li>
            ))}
          </ul>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    h.spyFilter("resolve:front-page:data").override((data) => ({
      ...data,
      entries: data.entries.filter(
        (entry: ResolvedEntry) => entry.slug !== "filtered-out",
      ),
    }));
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "filtered-out",
      title: "Filtered Out",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entry.create({
      type: "post",
      slug: "kept-by-filter",
      title: "Kept",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    const body = await response.text();
    expect(body).toContain('data-testid="row-kept-by-filter"');
    expect(body).not.toContain('data-testid="row-filtered-out"');
  });
});

describe("resolvePublicRoute — error pages through theme", () => {
  test("registered `404` template renders for an unmatched URL", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "404": ({ data }) => (
          <main data-testid="four-oh-four">
            <h1>Page missing</h1>
            <code data-testid="hint">{data.hint ?? ""}</code>
          </main>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const response = await h.dispatch(
      new Request("https://cms.example/post/never-existed"),
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain('data-testid="four-oh-four"');
    expect(body).toContain("Page missing");
  });

  test("themed 404 preserves the `x-plumix-hint` diagnostic header", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "404": () => <main data-testid="four-oh-four" />,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const response = await h.dispatch(
      new Request("https://cms.example/post/never-existed"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-plumix-hint")).toBe("public-post-not-found");
  });

  test("no-theme 404 surfaces the plaintext `notFound` response unchanged", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin] });
    const response = await h.dispatch(
      new Request("https://cms.example/post/never-existed"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("x-plumix-hint")).toBe("public-post-not-found");
    expect(await response.text()).toBe("Not Found");
  });

  test("built-in 404 default renders when the theme has no `404` template", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const response = await h.dispatch(
      new Request("https://cms.example/post/never-existed"),
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    // Sanity: it's the built-in shell, not an empty 404.
    expect(body).toContain("<!doctype html>");
    expect(body).toContain("Not Found");
  });

  test("theme template that throws renders the `500` template + 500 status", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: () => {
          throw new Error("kaboom-secret-payload");
        },
        "500": ({ data }) => (
          <main data-testid="five-oh-oh">
            <h1>Server error</h1>
            <p data-testid="hint">{data.hint ?? ""}</p>
          </main>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "boom",
      title: "Boom",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/boom"),
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('data-testid="five-oh-oh"');
    // Internal error text must never leak to clients.
    expect(body).not.toContain("kaboom-secret-payload");
  });

  test("built-in 500 default renders when the theme has no `500` template", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: () => {
          throw new Error("kaboom-different-payload");
        },
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "boom2",
      title: "Boom2",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/boom2"),
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("<!doctype html>");
    expect(body).toContain("Internal Server Error");
    expect(body).not.toContain("kaboom-different-payload");
  });

  test("a resolver-side throw renders the themed `500` template, not JSON", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <h1>{data.entry.title}</h1>,
        "500": () => <main data-testid="five-oh-oh" />,
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    h.spyFilter("resolve:single:data").override(() => {
      throw new Error("kaboom-resolver-secret");
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "boom-resolver",
      title: "Boom Resolver",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/boom-resolver"),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain('data-testid="five-oh-oh"');
    expect(body).not.toContain("kaboom-resolver-secret");
  });

  test("falls back to plaintext 500 when the theme's `500` template also throws", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: () => {
          throw new Error("kaboom-inner-secret");
        },
        "500": () => {
          throw new Error("kaboom-error-template-secret");
        },
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "double-boom",
      title: "Double Boom",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/double-boom"),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("Internal Server Error");
    expect(body).not.toContain("kaboom-inner-secret");
    expect(body).not.toContain("kaboom-error-template-secret");
  });
});
