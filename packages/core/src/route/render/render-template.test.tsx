import { useId } from "react";
import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";
import { BlockRenderer } from "@plumix/blocks/renderer";

import type { ResolvedEntry } from "./resolved-entry.js";
import { entries as entriesTable } from "../../db/schema/entries.js";
import { definePlugin } from "../../plugin/define.js";
import { defineTemplate } from "../../template.js";
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
        index: ({ data }) =>
          "entry" in data ? (
            <article data-testid="index">{data.entry.title}</article>
          ) : null,
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
        index: () => null,
        single: ({ data }) => <h1>{data.entry.title}</h1>,
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
        index: () => null,
        single: ({ data }) => (
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
        index: () => null,
        single: ({ data }) => (
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
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
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

  test("manifest `html.lang` spreads onto the rendered <html>", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: { html: { lang: "fr" } },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "lang",
      title: "Lang",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/lang"),
    );
    const body = await response.text();
    expect(body).toContain('<html lang="fr">');
  });

  test("manifest `body.className` spreads onto the rendered <body>", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: { body: { className: "font-sans theme-light" } },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "body-class",
      title: "Body",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/body-class"),
    );
    const body = await response.text();
    expect(body).toContain('<body class="font-sans theme-light">');
  });

  test("bundled CSS from the asset manifest auto-injects after theme link[]", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        link: [{ rel: "icon", href: "/favicon.svg" }],
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogPlugin],
      theme,
      assetManifest: {
        "src/theme/index.ts": {
          file: "_plumix/assets/theme-abc123.js",
          isEntry: true,
          css: ["_plumix/assets/theme-def456.css"],
        },
      },
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "css-bundle",
      title: "CSS Bundle",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/css-bundle"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    // The bundled CSS link must follow the theme's own `link[]` so it
    // wins the cascade.
    expect(headSection).toMatch(
      /<link\s+rel="icon"[\s\S]*<link\s+rel="stylesheet"\s+href="\/_plumix\/assets\/theme-def456\.css"/,
    );
  });

  test("per-template document fragment merges with theme document; theme entries first", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          document: {
            meta: [{ name: "robots", content: "noindex" }],
            html: { className: "single-variant" },
          },
          render: ({ data }) => <article>{data.entry.title}</article>,
        }),
      },
      document: {
        meta: [{ name: "theme-color", content: "#0ea5e9" }],
        html: { lang: "en", className: "site" },
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "merged-doc",
      title: "Merged",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/merged-doc"),
    );
    const body = await response.text();
    // html.className concatenated, theme first then template
    expect(body).toContain('<html lang="en" class="site single-variant">');
    // Meta from both theme and template appear, theme before template
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toMatch(
      /<meta\s+name="theme-color"[\s\S]*<meta\s+name="robots"\s+content="noindex"/,
    );
  });

  test("per-template script[] with headEnd position lands in head after theme scripts", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          document: {
            script: [
              {
                src: "https://template.example/single.js",
                position: "headEnd",
                defer: true,
              },
            ],
          },
          render: ({ data }) => <article>{data.entry.title}</article>,
        }),
      },
      document: {
        script: [
          {
            src: "https://theme.example/site.js",
            position: "headEnd",
          },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "script-position",
      title: "Script Position",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const response = await h.dispatch(
      new Request("https://cms.example/post/script-position"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    // Both scripts in head; theme's first, template's after
    expect(headSection).toMatch(
      /<script\s+src="https:\/\/theme\.example\/site\.js"[^>]*><\/script>[\s\S]*<script\s+src="https:\/\/template\.example\/single\.js"/,
    );
  });

  test("template `document` accepts a function that receives the render args and renders per-request", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          document: ({ data }) => ({
            meta: [
              {
                property: "og:description",
                content: `desc:${data.entry.title}`,
              },
            ],
          }),
          render: ({ data }) => <article>{data.entry.title}</article>,
        }),
      },
      document: {
        meta: [{ name: "theme-color", content: "#0ea5e9" }],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "dyn",
      title: "Dynamic Title",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/dyn"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toContain(
      '<meta property="og:description" content="desc:Dynamic Title"',
    );
    expect(headSection).toContain('<meta name="theme-color"');
  });

  test("templates without a document fragment fall back to the theme-wide document", async () => {
    // Locks the contract: a template that doesn't declare its own
    // fragment shouldn't pay any per-template cost — and shouldn't
    // accidentally render a wrong document either.
    const theme = defineTheme({
      templates: {
        index: () => null,
        // Plain function form — no `document` at all.
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        meta: [{ name: "theme-color", content: "#0ea5e9" }],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "no-fragment",
      title: "No Fragment",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const response = await h.dispatch(
      new Request("https://cms.example/post/no-fragment"),
    );
    const body = await response.text();
    expect(body).toContain('<meta name="theme-color" content="#0ea5e9"');
  });

  test("React hooks (useId) inside a factory template render correctly", async () => {
    // Regression for the gotcha: if the renderer calls `template.render`
    // outside React's render pass, useId / useState etc. throw with
    // "Invalid hook call". The TemplateAdapter wraps the call so hooks
    // are legal — this test enforces that contract.
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          render: ({ data }) => {
            const id = useId();
            return (
              <article id={id} data-testid="hook-host">
                {data.entry.title}
              </article>
            );
          },
        }),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hooks-ok",
      title: "Hooks Ok",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const response = await h.dispatch(
      new Request("https://cms.example/post/hooks-ok"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="hook-host"');
    // React 19's useId returns deterministic SSR ids beginning with «r;
    // assert just the presence of an id attribute, not its value.
    expect(body).toMatch(/<article\s+id="[^"]+"/);
  });

  test("factory-built template's render receives ctx with request + resolvedEntity", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          render: ({ data, ctx }) => (
            <article data-testid="entry">
              <h1>{data.entry.title}</h1>
              <p data-testid="ctx-host">{new URL(ctx.request.url).host}</p>
            </article>
          ),
        }),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "ctx-aware",
      title: "Ctx Aware",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/ctx-aware"),
    );
    const body = await response.text();
    expect(body).toContain('data-testid="ctx-host"');
    expect(body).toContain("cms.example");
    expect(body).toContain("Ctx Aware");
  });

  test("`theme:document` filter contributions surface in SSR'd <head>", async () => {
    const seoPlugin = definePlugin("seo", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { property: "og:site_name", content: "Demo" },
        ],
      }));
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
    });

    const h = await createDispatcherHarness({ plugins: [seoPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "filtered",
      title: "Filtered",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/filtered"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toContain(
      '<meta property="og:site_name" content="Demo"',
    );
  });

  test("manifest `link[]` entries land in <head> in declared order", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        link: [
          { rel: "icon", href: "/favicon.svg" },
          { rel: "preconnect", href: "https://fonts.example" },
          { rel: "stylesheet", href: "https://fonts.example/inter.css" },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "links",
      title: "Links",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/links"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toMatch(
      /<link\s+rel="icon"\s+href="\/favicon\.svg"\s*\/>[\s\S]*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.example"\s*\/>[\s\S]*<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.example\/inter\.css"\s*\/>/,
    );
  });

  test("manifest `meta[]` entries land in <head> in declared order", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        meta: [
          { name: "description", content: "Site default" },
          { property: "og:site_name", content: "Demo" },
          { name: "theme-color", content: "#1e293b" },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "metas",
      title: "Metas",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/metas"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toMatch(
      /<meta\s+name="description"\s+content="Site default"\s*\/>[\s\S]*<meta\s+property="og:site_name"\s+content="Demo"\s*\/>[\s\S]*<meta\s+name="theme-color"\s+content="#1e293b"\s*\/>/,
    );
  });

  test('manifest `script[].position="headStart"` lands at the top of <head>', async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        link: [{ rel: "icon", href: "/favicon.svg" }],
        script: [
          {
            src: "https://plausible.io/js/script.js",
            defer: true,
            position: "headStart",
          },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "head-start",
      title: "Head Start",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/head-start"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toMatch(
      /<script\s+src="https:\/\/plausible\.io\/js\/script\.js"\s+defer(?:="[^"]*")?\s*>[\s\S]*<link\s+rel="icon"/,
    );
  });

  test('manifest `script[].position="headEnd"` lands after theme link/meta but inside <head>', async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        link: [{ rel: "icon", href: "/favicon.svg" }],
        meta: [{ name: "theme-color", content: "#ffffff" }],
        script: [
          {
            src: "https://cdn.example/late.js",
            position: "headEnd",
          },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "head-end",
      title: "Head End",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/head-end"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toMatch(
      /<link\s+rel="icon"[\s\S]*<meta\s+name="theme-color"[\s\S]*<script\s+src="https:\/\/cdn\.example\/late\.js"/,
    );
  });

  test('manifest `script[].position="bodyStart"` lands at the top of <body>', async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <article data-testid="entry">{data.entry.title}</article>
        ),
      },
      document: {
        script: [
          {
            src: "https://cdn.example/boot.js",
            position: "bodyStart",
          },
        ],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "body-start",
      title: "Body Start",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/body-start"),
    );
    const body = await response.text();
    const bodySection = body.slice(
      body.indexOf("<body"),
      body.indexOf("</body>"),
    );
    expect(bodySection).toMatch(
      /<body[^>]*><script\s+src="https:\/\/cdn\.example\/boot\.js"[^>]*>[\s\S]*<article[^>]*data-testid="entry"/,
    );
  });

  test("manifest `script[]` with no position defaults to end of <body>", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <article data-testid="entry">{data.entry.title}</article>
        ),
      },
      document: {
        script: [{ src: "https://cdn.example/analytics.js" }],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "body-end",
      title: "Body End",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/body-end"),
    );
    const body = await response.text();
    const bodySection = body.slice(
      body.indexOf("<body"),
      body.indexOf("</body>"),
    );
    expect(bodySection).toMatch(
      /<article[^>]*data-testid="entry"[\s\S]*<script\s+src="https:\/\/cdn\.example\/analytics\.js"/,
    );
  });

  test("reserved hydration slot sits at the end of <body>, after any theme scripts", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        script: [{ src: "https://cdn.example/analytics.js" }],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hydration-slot",
      title: "Hydration Slot",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hydration-slot"),
    );
    const body = await response.text();
    expect(body).toContain("<!--plumix-hydration-slot-->");
    const slotIdx = body.indexOf("<!--plumix-hydration-slot-->");
    const closingBodyIdx = body.indexOf("</body>");
    const scriptIdx = body.indexOf("https://cdn.example/analytics.js");
    expect(scriptIdx).toBeGreaterThan(0);
    expect(scriptIdx).toBeLessThan(slotIdx);
    expect(slotIdx).toBeLessThan(closingBodyIdx);
  });

  test("template-rendered <title> wins over framework default title", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <>
            <title>From-Template</title>
            <article>{data.entry.title}</article>
          </>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hoisting",
      title: "Framework-Default",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hoisting"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    // React 19 hoists template-rendered <title> into <head>; the
    // framework default must not shadow it (browsers honor the first
    // <title> in document order).
    expect(headSection).toContain("<title>From-Template</title>");
    expect(headSection).not.toContain("<title>Framework-Default</title>");
  });

  test("react 19 hoists template-rendered <script> into <head>", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <>
            <script
              async
              src="https://cdn.example/from-template.js"
              data-testid="hoisted-script"
            />
            <article>{data.entry.title}</article>
          </>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "hoisted-script",
      title: "Hoisted Script",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/hoisted-script"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    const bodySection = body.slice(
      body.indexOf("<body"),
      body.indexOf("</body>"),
    );
    expect(headSection).toContain("https://cdn.example/from-template.js");
    expect(bodySection).not.toContain("https://cdn.example/from-template.js");
  });

  test("manifest `meta[]` translates JSX-cased keys (`httpEquiv` -> `http-equiv`)", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => <article>{data.entry.title}</article>,
      },
      document: {
        meta: [{ httpEquiv: "X-UA-Compatible", content: "IE=edge" }],
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "http-equiv",
      title: "HttpEquiv",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/http-equiv"),
    );
    const body = await response.text();
    const headSection = body.slice(
      body.indexOf("<head>"),
      body.indexOf("</head>"),
    );
    expect(headSection).toContain(
      '<meta http-equiv="X-UA-Compatible" content="IE=edge"',
    );
    expect(headSection).not.toContain("httpEquiv");
  });

  test("theme reads entry.contentBlocks without a cast", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <span data-testid="blocks">
            {`blocks:${String(data.entry.contentBlocks?.blocks.length ?? 0)}`}
          </span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "typed",
      title: "Typed",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "a", name: "core/heading", attrs: { text: "Hi" } },
          { id: "b", name: "core/paragraph", attrs: { text: "ok" } },
        ],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/typed"),
    );
    expect(await response.text()).toContain("blocks:2");
  });

  test("contentBlocks is null when stored content doesn't match the EntryContent shape", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) => (
          <span data-testid="result">
            {`isNull:${String(data.entry.contentBlocks === null)}`}
          </span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.db.insert(entriesTable).values({
      type: "post",
      slug: "bad",
      title: "Bad",
      content: { not: "valid" },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/bad"),
    );
    expect(await response.text()).toContain("isNull:true");
  });

  test("template can render <BlockRenderer/> against the entry's content tree", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) =>
          data.entry.contentBlocks ? (
            <BlockRenderer content={data.entry.contentBlocks} />
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

  test("dispatcher pre-resolves block loaders before render — render() sees the resolved data", async () => {
    const probePlugin = definePlugin("acme-probe", (ctx) => {
      ctx.registerBlock(
        defineBlock({
          name: "acme/probe",
          loaders: {
            marker: () => Promise.resolve("loaded-on-server"),
          },
          render: ({ loaders }) => <div data-loaded>{loaders.marker}</div>,
        }),
      );
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: ({ data }) =>
          data.entry.contentBlocks ? (
            <BlockRenderer content={data.entry.contentBlocks} />
          ) : null,
      },
    });

    const h = await createDispatcherHarness({
      plugins: [blogPlugin, probePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "with-loader",
      title: "Loader Block",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "n", name: "acme/probe", attrs: {} }],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/with-loader"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("loaded-on-server");
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

  test("archive listing exposes `entry.url` to templates", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) => (
              <li key={entry.id}>{entry.url}</li>
            ))}
          </ul>
        ),
      },
    });
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "alpha",
      title: "Alpha",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    expect(await response.text()).toContain("/post/alpha");
  });

  test("archive with `prefetchListingLoaders` resolves block loaders for every entry", async () => {
    const probePlugin = definePlugin("acme-listing-probe", (ctx) => {
      ctx.registerBlock(
        defineBlock({
          name: "acme/listing-probe",
          loaders: {
            marker: (args: { readonly attrs: Record<string, unknown> }) => {
              const tag =
                typeof args.attrs.tag === "string" ? args.attrs.tag : "?";
              return Promise.resolve(`loaded-${tag}`);
            },
          },
          render: ({ loaders }) => <span>{loaders.marker}</span>,
        }),
      );
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: defineTemplate({
          prefetchListingLoaders: true,
          render: ({ data }) => (
            <ul>
              {data.entries.map((entry: ResolvedEntry) =>
                entry.contentBlocks ? (
                  <li key={entry.id}>
                    <BlockRenderer content={entry.contentBlocks} />
                  </li>
                ) : null,
              )}
            </ul>
          ),
        }),
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, probePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "alpha",
      title: "Alpha",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "alpha-1", name: "acme/listing-probe", attrs: { tag: "a" } },
        ],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-05-01"),
    });
    await h.factory.entry.create({
      type: "post",
      slug: "beta",
      title: "Beta",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "beta-1", name: "acme/listing-probe", attrs: { tag: "b" } },
        ],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-05-02"),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    expect(body).toContain("loaded-a");
    expect(body).toContain("loaded-b");
  });

  test("archive without `prefetchListingLoaders` leaves listing block loaders unresolved", async () => {
    const probePlugin = definePlugin("acme-listing-probe-off", (ctx) => {
      ctx.registerBlock(
        defineBlock({
          name: "acme/listing-probe-off",
          loaders: { marker: () => Promise.resolve("loader-fired") },
          render: ({ loaders }) => (
            <span data-testid="probe">{loaders.marker}</span>
          ),
        }),
      );
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <ul>
            {data.entries.map((entry: ResolvedEntry) =>
              entry.contentBlocks ? (
                <li key={entry.id}>
                  <BlockRenderer content={entry.contentBlocks} />
                </li>
              ) : null,
            )}
          </ul>
        ),
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, probePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "gamma",
      title: "Gamma",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "g-1", name: "acme/listing-probe-off", attrs: {} }],
      },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    const body = await response.text();
    // Block rendered (probe testid present) but loader never fired
    // (marker text absent — `loaders.marker` was undefined at runtime).
    expect(body).toContain('data-testid="probe"');
    expect(body).not.toContain("loader-fired");
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

  test("entry type's `archivePerPage` overrides the default page size on the archive", async () => {
    const smallPagePlugin = definePlugin("small-page", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
        archivePerPage: 5,
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        archive: ({ data }) => (
          <span data-testid="per-page">{`perPage:${String(data.pagination.perPage)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [smallPagePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "p",
      title: "P",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(new Request("https://cms.example/post"));
    expect(await response.text()).toContain("perPage:5");
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

  test("taxonomy's `archivePerPage` overrides the default page size on term archives", async () => {
    const smallPageTaxonomy = definePlugin("small-page-tax", (ctx) => {
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
        archivePerPage: 3,
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        taxonomy: ({ data }) => (
          <span data-testid="per-page">{`perPage:${String(data.pagination.perPage)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({
      plugins: [smallPageTaxonomy],
      theme,
    });
    const author = await h.seedUser("admin");
    const term = await h.factory.term.create({
      taxonomy: "topic",
      slug: "news",
      name: "News",
    });
    const entry = await h.factory.entry.create({
      type: "post",
      slug: "t",
      title: "T",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.factory.entryTerm.create({
      entryId: entry.id,
      termId: term.id,
      sortOrder: 0,
    });

    const response = await h.dispatch(
      new Request("https://cms.example/topic/news"),
    );
    expect(await response.text()).toContain("perPage:3");
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

  test("/page/N renders the front-page on page N", async () => {
    const theme = defineTheme({
      templates: {
        index: () => null,
        "front-page": ({ data }) => (
          <span data-testid="page">{`page:${String(data.pagination.page)}`}</span>
        ),
      },
    });

    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "p",
      title: "P",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const response = await h.dispatch(
      new Request("https://cms.example/page/1"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("page:1");
  });

  test("/page/0 on the front-page is out-of-range 404", async () => {
    const theme = defineTheme({
      templates: { index: () => null, "front-page": () => null },
    });
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });

    const response = await h.dispatch(
      new Request("https://cms.example/page/0"),
    );
    expect(response.status).toBe(404);
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
