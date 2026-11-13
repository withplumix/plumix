import { describe, expect, test } from "vitest";

import type {
  DocumentManifest,
  DocumentViewport,
} from "../../src/document-manifest.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
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

const fragmentSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: {
              meta: [{ name: "robots", content: "noindex" }],
              html: { className: "single-variant" },
            },
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
      document: {
        meta: [{ name: "author", content: "Demo" }],
        html: { lang: "en", className: "site" },
      },
    }),
  },
});

const invalidFragmentSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            // `rel` is required on every link; the empty one trips
            // `validateDocumentManifest` when the fragment merges at render.
            document: { link: [{ rel: "", href: "/x.css" }] },
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
    }),
  },
});

const templateScriptSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
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
        ),
      ],
      document: {
        script: [
          {
            src: "https://theme.example/site.js",
            position: "headEnd",
          },
        ],
      },
    }),
  },
});

const dynamicFragmentSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
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
        ),
      ],
      document: {
        meta: [{ name: "author", content: "Demo" }],
      },
    }),
  },
});

const noFragmentSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        // Plain function form — no `document` at all.
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: {
        meta: [{ name: "author", content: "Demo" }],
      },
    }),
  },
});

describe("a template's document fragment", () => {
  test("merges with the theme document; theme entries first", async () => {
    const post = await fragmentSite.factory.published.create({
      type: "post",
      slug: "merged-doc",
      title: "Merged",
    });

    const page = await fragmentSite.visit(post);

    // html.className concatenated, theme first then template
    page.assertSee('<html lang="en" dir="ltr" class="site single-variant">');
    // Meta from both theme and template appear, theme before template
    page.assertSeeInOrder([
      "<head>",
      '<meta name="author"',
      '<meta name="robots" content="noindex"',
      "</head>",
    ]);
  });

  test("an invalid one fails the render (500)", async () => {
    const post = await invalidFragmentSite.factory.published.create({
      type: "post",
      slug: "bad-fragment",
      title: "Bad",
    });

    const page = await invalidFragmentSite.visit(post);

    page.assertStatus(500);
  });

  test("its script[] with headEnd position lands in head after theme scripts", async () => {
    const post = await templateScriptSite.factory.published.create({
      type: "post",
      slug: "script-position",
      title: "Script Position",
    });

    const page = await templateScriptSite.visit(post);

    // Both scripts in head; theme's first, template's after
    page.assertSeeInOrder([
      "<head>",
      '<script src="https://theme.example/site.js"',
      "</script>",
      '<script src="https://template.example/single.js"',
      "</head>",
    ]);
  });

  test("may be a function that receives the render args and renders per-request", async () => {
    const post = await dynamicFragmentSite.factory.published.create({
      type: "post",
      slug: "dyn",
      title: "Dynamic Title",
    });

    const page = await dynamicFragmentSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta property="og:description" content="desc:Dynamic Title"',
      "</head>",
    ]);
    page.assertSeeInOrder(["<head>", '<meta name="author"', "</head>"]);
  });

  test("when a template declares none, the theme-wide document still renders", async () => {
    // Locks the contract: a template that doesn't declare its own
    // fragment shouldn't pay any per-template cost — and shouldn't
    // accidentally render a wrong document either.
    const post = await noFragmentSite.factory.published.create({
      type: "post",
      slug: "no-fragment",
      title: "No Fragment",
    });

    const page = await noFragmentSite.visit(post);

    page.assertSee('<meta name="author" content="Demo"');
  });
});

const seoPlugin = definePlugin("seo", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
    ctx.registerDocumentManifest({
      meta: [{ property: "og:site_name", content: "Demo" }],
    });
  },
});

const registeredManifestSite = await testSite({
  plugins: [seoPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: { meta: [{ name: "author", content: "Demo" }] },
    }),
  },
});

describe("a registered document manifest", () => {
  test("renders its tags in <head> after the theme's", async () => {
    const post = await registeredManifestSite.factory.published.create({
      type: "post",
      slug: "registered",
      title: "Registered",
    });

    const page = await registeredManifestSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="author"',
      '<meta property="og:site_name" content="Demo"',
      "</head>",
    ]);
  });
});

/** One theme declaring every manifest slot, each test reading its own. */
const manifestSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <article data-testid="entry">{data.entry.title}</article>
        )),
      ],
      document: {
        link: [
          { rel: "icon", href: "/favicon.svg" },
          { rel: "preconnect", href: "https://fonts.example" },
          { rel: "stylesheet", href: "https://fonts.example/inter.css" },
        ],
        meta: [
          { name: "description", content: "Site default" },
          { property: "og:site_name", content: "Demo" },
          { name: "author", content: "Demo Team" },
          { httpEquiv: "X-UA-Compatible", content: "IE=edge" },
        ],
        script: [
          {
            src: "https://plausible.io/js/script.js",
            defer: true,
            position: "headStart",
          },
          { src: "https://cdn.example/late.js", position: "headEnd" },
          { src: "https://cdn.example/boot.js", position: "bodyStart" },
          { src: "https://cdn.example/analytics.js" },
        ],
      },
    }),
  },
});

describe("the theme's document manifest", () => {
  test("`link[]` entries land in <head> in declared order", async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "links",
      title: "Links",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<link rel="icon" href="/favicon.svg"/>',
      '<link rel="preconnect" href="https://fonts.example"/>',
      '<link rel="stylesheet" href="https://fonts.example/inter.css"/>',
      "</head>",
    ]);
  });

  test("`meta[]` entries land in <head> in declared order", async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "metas",
      title: "Metas",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="description" content="Site default"/>',
      '<meta property="og:site_name" content="Demo"/>',
      '<meta name="author" content="Demo Team"/>',
      "</head>",
    ]);
  });

  test('`script[].position="headStart"` lands at the top of <head>', async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "head-start",
      title: "Head Start",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<script src="https://plausible.io/js/script.js" defer',
      '<link rel="icon"',
    ]);
  });

  test('`script[].position="headEnd"` lands after theme link/meta but inside <head>', async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "head-end",
      title: "Head End",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      '<link rel="icon"',
      '<meta name="author"',
      '<script src="https://cdn.example/late.js"',
      "</head>",
    ]);
  });

  test('`script[].position="bodyStart"` lands at the top of <body>', async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "body-start",
      title: "Body Start",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      '<body><script src="https://cdn.example/boot.js"',
      'data-testid="entry"',
    ]);
  });

  test("`script[]` with no position defaults to end of <body>", async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "body-end",
      title: "Body End",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "<body",
      'data-testid="entry"',
      '<script src="https://cdn.example/analytics.js"',
      "</body>",
    ]);
  });

  test("reserved hydration slot sits at the end of <body>, after any theme scripts", async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "hydration-slot",
      title: "Hydration Slot",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "https://cdn.example/analytics.js",
      "<!--plumix-hydration-slot-->",
      "</body>",
    ]);
  });

  test("`meta[]` translates JSX-cased keys (`httpEquiv` -> `http-equiv`)", async () => {
    const post = await manifestSite.factory.published.create({
      type: "post",
      slug: "http-equiv",
      title: "HttpEquiv",
    });

    const page = await manifestSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta http-equiv="X-UA-Compatible" content="IE=edge"',
      "</head>",
    ]);
    page.assertDontSee("httpEquiv");
  });
});

const hoistedTitleSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <>
            <title>From-Template</title>
            <article>{data.entry.title}</article>
          </>
        )),
      ],
    }),
  },
});

const hoistedScriptSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <>
            <script
              async
              src="https://cdn.example/from-template.js"
              data-testid="hoisted-script"
            />
            <article>{data.entry.title}</article>
          </>
        )),
      ],
    }),
  },
});

describe("what a template renders into <head>", () => {
  test("a template-rendered <title> wins over the framework default title", async () => {
    const post = await hoistedTitleSite.factory.published.create({
      type: "post",
      slug: "hoisting",
      title: "Framework-Default",
    });

    const page = await hoistedTitleSite.visit(post);

    // React 19 hoists template-rendered <title> into <head>; the
    // framework default must not shadow it (browsers honor the first
    // <title> in document order).
    page.assertSeeInOrder([
      "<head>",
      "<title>From-Template</title>",
      "</head>",
    ]);
    page.assertDontSee("<title>Framework-Default</title>");
  });

  test("react 19 hoists a template-rendered <script> into <head>", async () => {
    const post = await hoistedScriptSite.factory.published.create({
      type: "post",
      slug: "hoisted-script",
      title: "Hoisted Script",
    });

    const page = await hoistedScriptSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      "https://cdn.example/from-template.js",
      "</head>",
    ]);
    expect(() =>
      page.assertSeeInOrder(["<body", "https://cdn.example/from-template.js"]),
    ).toThrow();
  });
});

function countViewportTags(body: string): number {
  return body.match(/<meta name="viewport"/g)?.length ?? 0;
}

const viewportSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: { viewport: { interactiveWidget: "resizes-content" } },
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
      document: { viewport: { viewportFit: "cover", userScalable: true } },
    }),
  },
});

const themeColorList: DocumentViewport["themeColor"] = [
  { color: "#ffffff", media: "(prefers-color-scheme: light)" },
  { color: "#000000", media: "(prefers-color-scheme: dark)" },
];

const themeColorListSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: {
        viewport: { themeColor: themeColorList, colorScheme: "light dark" },
      },
    }),
  },
});

const viewportFilterPlugin = definePlugin("viewport-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest): DocumentManifest => ({
      ...manifest,
      viewport: {
        ...manifest.viewport,
        width: 480,
        height: "device-height",
        initialScale: 0.5,
        minimumScale: 0.25,
        maximumScale: 3,
        userScalable: false,
        viewportFit: "contain",
        interactiveWidget: "overlays-content",
        themeColor: "#abcdef",
        colorScheme: "only dark",
      },
    }));
  },
});

const viewportFilterSite = await testSite({
  plugins: [blogPlugin, viewportFilterPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
      document: {
        viewport: { viewportFit: "cover", themeColor: themeColorList },
      },
    }),
  },
});

const undefinedViewportSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: {
              viewport: { width: undefined, initialScale: undefined },
            },
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
    }),
  },
});

const reservedFragmentSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: { meta: [{ name: "viewport", content: "width=320" }] },
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
    }),
  },
});

const reservedFilterPlugin = definePlugin("reserved-filter", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest) => ({
      ...manifest,
      meta: [
        ...(manifest.meta ?? []),
        { name: "Theme-Color", content: "#f00" },
      ],
    }));
  },
});

const reservedFilterSite = await testSite({
  plugins: [blogPlugin, reservedFilterPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
    }),
  },
});

describe("the document's viewport", () => {
  test("a theme's and a template's fields combine into one tag over the default", async () => {
    const post = await viewportSite.factory.published.create({
      type: "post",
      slug: "viewport",
      title: "Viewport",
    });

    const page = await viewportSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes, viewport-fit=cover, interactive-widget=resizes-content"/>',
      "</head>",
    ]);
    expect(countViewportTags(page.body)).toBe(1);
  });

  test("a themeColor list renders one tag per entry, with its media", async () => {
    const post = await themeColorListSite.factory.published.create({
      type: "post",
      slug: "theme-color-list",
      title: "Theme Color List",
    });

    const page = await themeColorListSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="viewport"',
      '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"/>',
      '<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"/>',
      "</head>",
    ]);
  });

  test("colorScheme renders one color-scheme tag", async () => {
    const post = await themeColorListSite.factory.published.create({
      type: "post",
      slug: "color-scheme",
      title: "Color Scheme",
    });

    const page = await themeColorListSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="color-scheme" content="light dark"/>',
      "</head>",
    ]);
    expect(page.body.match(/<meta name="color-scheme"/g)).toHaveLength(1);
  });

  test("without colorScheme no color-scheme tag renders", async () => {
    const post = await viewportSite.factory.published.create({
      type: "post",
      slug: "no-color-scheme",
      title: "No Color Scheme",
    });

    const page = await viewportSite.visit(post);

    page.assertDontSee('name="color-scheme"');
  });

  test("a render.document filter can change every field", async () => {
    const post = await viewportFilterSite.factory.published.create({
      type: "post",
      slug: "filtered-viewport",
      title: "Filtered Viewport",
    });

    const page = await viewportFilterSite.visit(post);

    page.assertSeeInOrder([
      "<head>",
      '<meta name="viewport" content="width=480, height=device-height, initial-scale=0.5, minimum-scale=0.25, maximum-scale=3, user-scalable=no, viewport-fit=contain, interactive-widget=overlays-content"/>',
      '<meta name="theme-color" content="#abcdef"/>',
      '<meta name="color-scheme" content="only dark"/>',
      "</head>",
    ]);
    page.assertDontSee("prefers-color-scheme");
    expect(countViewportTags(page.body)).toBe(1);
  });

  test("a field set to undefined keeps the default", async () => {
    const post = await undefinedViewportSite.factory.published.create({
      type: "post",
      slug: "undefined-viewport",
      title: "Undefined Viewport",
    });

    const page = await undefinedViewportSite.visit(post);

    page.assertSee(
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    );
  });

  test("a template fragment's `meta` entry named viewport fails the render", async () => {
    const post = await reservedFragmentSite.factory.published.create({
      type: "post",
      slug: "reserved-fragment",
      title: "Reserved Fragment",
    });

    const page = await reservedFragmentSite.visit(post);

    page.assertStatus(500);
    expect(
      reservedFragmentSite.logger.lines.map((line) => line.meta?.err),
    ).toContain(
      'The document manifest has a `meta[0]` entry named "viewport". The ' +
        "renderer writes that tag itself, once per page, so a second one " +
        "would leave browsers to pick between them. Set `viewport` instead.",
    );
  });

  test("a render.document filter's `meta` entry named theme-color fails the render", async () => {
    const post = await reservedFilterSite.factory.published.create({
      type: "post",
      slug: "reserved-filter",
      title: "Reserved Filter",
    });

    const page = await reservedFilterSite.visit(post);

    page.assertStatus(500);
    expect(
      reservedFilterSite.logger.lines.map((line) => line.meta?.err),
    ).toContain(
      'The document manifest has a `meta[0]` entry named "Theme-Color". The ' +
        "renderer writes that tag itself, once per page, so a second one " +
        "would leave browsers to pick between them. Set " +
        "`viewport.themeColor` instead.",
    );
  });
});
