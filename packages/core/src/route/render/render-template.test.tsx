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
