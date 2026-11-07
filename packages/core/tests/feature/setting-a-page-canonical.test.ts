import { describe, expect, test } from "vitest";

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

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof testSite>>["visit"]>>;

/** No second canonical follows the first, so the page holds at most one. */
function assertNoSecondCanonical(page: Page): void {
  expect(() =>
    page.assertSeeInOrder(['rel="canonical"', 'rel="canonical"']),
  ).toThrow();
}

const site = await testSite({
  plugins: [blogPlugin],
  config: { theme: defineTheme({ templates: [fallback(() => null)] }) },
});

describe("a public page's canonical", () => {
  test("a public page renders exactly one canonical with the slash-less absolute URL", async () => {
    await site.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await site.visit("/post/hello");

    page.assertSee(
      '<link rel="canonical" href="https://cms.example/post/hello"/>',
    );
    assertNoSecondCanonical(page);
  });
});

const seoPlugin = definePlugin("seo-test", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest) => ({
      ...manifest,
      link: [
        ...(manifest.link ?? []),
        { rel: "canonical", href: "https://cms.example/override" },
      ],
    }));
  },
});

const overriding = await testSite({
  plugins: [blogPlugin, seoPlugin],
  config: { theme: defineTheme({ templates: [fallback(() => null)] }) },
});

describe("a render.document handler's canonical", () => {
  test("a render.document handler can override the canonical (gap-filler skips)", async () => {
    await overriding.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await overriding.visit("/post/hello");

    page.assertSee('href="https://cms.example/override"');
    assertNoSecondCanonical(page);
  });
});

const themed = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null)],
      document: {
        link: [{ rel: "canonical", href: "https://cms.example/from-theme" }],
      },
    }),
  },
});

describe("a theme's canonical", () => {
  test("a template-set canonical is not duplicated by the gap-filler", async () => {
    await themed.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await themed.visit("/post/hello");

    page.assertSee('href="https://cms.example/from-theme"');
    assertNoSecondCanonical(page);
  });
});

const templateOptOut = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: () => ({ canonical: false }),
            render: () => null,
          }),
        ),
      ],
    }),
  },
});

describe("a template that opts out of the canonical", () => {
  test("a template whose document returns canonical: false renders no canonical", async () => {
    await templateOptOut.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await templateOptOut.visit("/post/hello");

    page.assertSee("<title>").assertDontSee('rel="canonical"');
  });
});

const themeOptOutWithLink = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null)],
      document: {
        canonical: false,
        link: [{ rel: "canonical", href: "https://x.example/y" }],
      },
    }),
  },
});

describe("a theme that opts out of the canonical but declares one", () => {
  test("a canonical the page declares still renders under canonical: false", async () => {
    await themeOptOutWithLink.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await themeOptOutWithLink.visit("/post/hello");

    page.assertSee('href="https://x.example/y"');
    assertNoSecondCanonical(page);
  });
});

const themeOptOut = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: { meta: [{ name: "x-template", content: "entry" }] },
            render: () => null,
          }),
        ),
      ],
      document: { canonical: false },
    }),
  },
});

describe("a template under a theme that opts out of the canonical", () => {
  test("a template that leaves canonical unset inherits the theme's canonical: false", async () => {
    await themeOptOut.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await themeOptOut.visit("/post/hello");

    page.assertSee('name="x-template"').assertDontSee('rel="canonical"');
  });
});

const perEntryOptOut = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: ({ data }) =>
              data.entry.slug === "shortlist" ? { canonical: false } : {},
            render: () => null,
          }),
        ),
      ],
    }),
  },
});

describe("a document function that opts one entry out of the canonical", () => {
  test("renders no canonical on the entry it opts out", async () => {
    await perEntryOptOut.factory.published.create({
      slug: "shortlist",
      title: "Shortlist",
    });

    const page = await perEntryOptOut.visit("/post/shortlist");

    page.assertSee("<title>Shortlist</title>").assertDontSee('rel="canonical"');
  });

  test("leaves the other entries' canonicals", async () => {
    await perEntryOptOut.factory.published.create({
      slug: "shortlist",
      title: "Shortlist",
    });
    await perEntryOptOut.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await perEntryOptOut.visit("/post/hello");

    page.assertSee(
      '<link rel="canonical" href="https://cms.example/post/hello"/>',
    );
  });
});
