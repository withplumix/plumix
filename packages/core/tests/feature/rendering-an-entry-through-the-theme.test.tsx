import { describe, test } from "vitest";

import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  fallback,
  forEntryType,
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

const single = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <h1 data-testid="title">{data.entry.title}</h1>),
      ],
    }),
  },
});

describe("an entry with a `single` template", () => {
  test("renders the entry title via the matched `single` template", async () => {
    await single.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await single.visit("/post/hello");

    page.assertOk().assertSee('data-testid="title"').assertSee("Hello");
  });
});

const indexOnly = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(({ data }) =>
          "entry" in data ? (
            <article data-testid="index">{data.entry.title}</article>
          ) : null,
        ),
      ],
    }),
  },
});

describe("an entry with no `single` template", () => {
  test("falls through to `index` template when no `single` is registered", async () => {
    await indexOnly.factory.published.create({
      slug: "fallback",
      title: "Fallback",
    });

    const page = await indexOnly.visit("/post/fallback");

    page.assertSee('data-testid="index"').assertSee("Fallback");
  });
});

const tiered = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => <div data-testid="index" />),
        entry(() => <div data-testid="single" />),
        forEntryType("post").template(() => <div data-testid="single-post" />),
      ],
    }),
  },
});

describe("an entry matching several template tiers", () => {
  test("more-specific keys win: single-{type} > single > index", async () => {
    await tiered.factory.published.create({
      slug: "specific",
      title: "Specific",
    });

    const page = await tiered.visit("/post/specific");

    page
      .assertSee('data-testid="single-post"')
      .assertDontSee('data-testid="single"');
  });
});

const retitling = definePlugin("retitling", {
  setup: (ctx) => {
    ctx.filters.add(render.single, (data) => ({
      ...data,
      entry: { ...data.entry, title: "Filtered" },
    }));
  },
});

const filtered = await testSite({
  plugins: [blogPlugin, retitling],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <h1>{data.entry.title}</h1>),
      ],
    }),
  },
});

describe("an entry under a render.single filter", () => {
  test("runs render.single filters before the template renders", async () => {
    await filtered.factory.published.create({
      slug: "filtered",
      title: "Original",
    });

    const page = await filtered.visit("/post/filtered");

    page.assertSee("Filtered").assertDontSee("Original");
  });
});

const byline = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <p data-testid="author">{data.entry.author.name}</p>
        )),
      ],
    }),
  },
});

describe("an entry's author", () => {
  test("template receives ResolvedAuthor with public-safe fields", async () => {
    const author = await byline.factory.user.create({
      email: "byline-author@example.test",
      name: "Eve Author",
      role: "admin",
    });
    await byline.factory.published.create({
      slug: "with-byline",
      title: "Byline",
      authorId: author.id,
    });

    const page = await byline.visit("/post/with-byline");

    page.assertSee("Eve Author").assertDontSee("byline-author@example.test");
  });
});

const tagged = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <span data-testid="terms">{`terms:${String(data.entry.terms.length)}`}</span>
        )),
      ],
    }),
  },
});

describe("an entry's terms", () => {
  test("template receives eager-loaded terms in batched order", async () => {
    const post = await tagged.factory.published.create({
      slug: "tagged",
      title: "Tagged",
    });
    const alpha = await tagged.factory.term.create({
      taxonomy: "category",
      slug: "alpha",
      name: "Alpha",
    });
    const beta = await tagged.factory.term.create({
      taxonomy: "category",
      slug: "beta",
      name: "Beta",
    });
    await tagged.factory.entryTerm.create({
      entryId: post.id,
      termId: alpha.id,
      sortOrder: 0,
    });
    await tagged.factory.entryTerm.create({
      entryId: post.id,
      termId: beta.id,
      sortOrder: 1,
    });

    const page = await tagged.visit("/post/tagged");

    page.assertSee("terms:2");
  });
});

const shell = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
    }),
  },
});

describe("the default document shell", () => {
  test("default document shell supplies doctype + html/head/body with charset, viewport, and title", async () => {
    await shell.factory.published.create({ slug: "doc", title: "DocTitle" });

    const page = await shell.visit("/post/doc");

    page
      .assertSee("<!doctype html>")
      .assertSee('<html lang="en" dir="ltr">')
      .assertSee('<meta charSet="utf-8"/>')
      .assertSee(
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
      )
      .assertSee("<title>DocTitle</title>")
      .assertSee("<body>");
  });
});

const french = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: { html: { lang: "fr" } },
    }),
  },
});

describe("a theme manifest's `html` attributes", () => {
  test("manifest `html.lang` spreads onto the rendered <html>", async () => {
    await french.factory.published.create({ slug: "lang", title: "Lang" });

    const page = await french.visit("/post/lang");

    page.assertSee('<html lang="fr" dir="ltr">');
  });
});

const bodyClass = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: { body: { className: "font-sans theme-light" } },
    }),
  },
});

describe("a theme manifest's `body` attributes", () => {
  test("manifest `body.className` spreads onto the rendered <body>", async () => {
    await bodyClass.factory.published.create({
      slug: "body-class",
      title: "Body",
    });

    const page = await bodyClass.visit("/post/body-class");

    page.assertSee('<body class="font-sans theme-light">');
  });
});

const bundled = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: {
        link: [{ rel: "icon", href: "/favicon.svg" }],
      },
    }),
  },
  build: {
    assetManifest: {
      "src/theme/index.ts": {
        file: "_plumix/assets/theme-abc123.js",
        isEntry: true,
        css: ["_plumix/assets/theme-def456.css"],
      },
    },
  },
});

describe("a build's bundled CSS", () => {
  test("bundled CSS from the asset manifest auto-injects after theme link[]", async () => {
    await bundled.factory.published.create({
      slug: "css-bundle",
      title: "CSS Bundle",
    });

    const page = await bundled.visit("/post/css-bundle");

    // The bundled CSS link must follow the theme's own `link[]` so it
    // wins the cascade.
    page.assertSeeInOrder([
      '<link rel="icon"',
      '<link rel="stylesheet" href="/_plumix/assets/theme-def456.css"',
      "</head>",
    ]);
  });
});
