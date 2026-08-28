import type { JsonValue } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import { seo } from "./index.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
    supports: ["title", "editor", "excerpt"],
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: false,
    entryTypes: ["post"],
  });
});

const theme = defineTheme({ templates: [fallback(() => null)] });

function createHarness(): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [blogPlugin, seo()], theme });
}

async function seedSettings(
  h: DispatcherHarness,
  group: string,
  values: Record<string, JsonValue>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await h.factory.setting.create({ group, key, value });
  }
}

async function seedPost(
  h: DispatcherHarness,
  overrides: {
    readonly slug?: string;
    readonly excerpt?: string;
    readonly meta?: Record<string, JsonValue>;
  } = {},
): Promise<void> {
  const author = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: overrides.slug ?? "hello",
    title: "Hello",
    ...(overrides.excerpt === undefined ? {} : { excerpt: overrides.excerpt }),
    ...(overrides.meta === undefined ? {} : { meta: overrides.meta }),
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date(),
  });
}

function headOf(body: string): string {
  return body.slice(body.indexOf("<head>"), body.indexOf("</head>"));
}

async function dispatchHead(
  h: DispatcherHarness,
  url: string,
): Promise<string> {
  const res = await h.dispatch(new Request(url));
  return headOf(await res.text());
}

describe("head meta", () => {
  test("an entry page emits the singular default meta set", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", {
      title: "Demo",
      tagline: "A tagline",
    });
    await seedSettings(h, "seo", {
      default_og_image: "https://cms.example/og.png",
    });
    await seedPost(h, { excerpt: "My excerpt" });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head.match(/name="description"/g)).toHaveLength(1);
    expect(head).toContain('<meta name="description" content="My excerpt"/>');
    expect(head).toContain(
      '<meta name="robots" content="index,follow,max-image-preview:large"/>',
    );
    expect(head).toContain('<meta property="og:title" content="Hello"/>');
    expect(head).toContain('<meta property="og:type" content="article"/>');
    expect(head).toContain(
      '<meta property="og:url" content="https://cms.example/post/hello"/>',
    );
    expect(head).toContain('<meta property="og:site_name" content="Demo"/>');
    expect(head).toContain('<meta property="og:locale" content="en"/>');
    expect(head).toContain(
      '<meta property="og:image" content="https://cms.example/og.png"/>',
    );
    expect(head).toContain(
      '<meta name="twitter:card" content="summary_large_image"/>',
    );
  });

  test("an entry page carries its timestamps and byline", async () => {
    const h = await createHarness();
    const author = await h.factory.user.create({
      role: "admin",
      name: "Ada Lovelace",
    });
    await h.factory.entry.create({
      type: "post",
      slug: "dated",
      title: "Dated",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date("2026-01-02T03:04:05.000Z"),
    });

    const head = await dispatchHead(h, "https://cms.example/post/dated");

    expect(head).toContain(
      '<meta property="article:published_time" content="2026-01-02T03:04:05.000Z"/>',
    );
    expect(head).toContain('<meta property="article:modified_time"');
    expect(head).toContain(
      '<meta property="article:author" content="Ada Lovelace"/>',
    );
  });

  test("an archive page is a website and carries no article facts", async () => {
    const h = await createHarness();
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post");

    expect(head).toContain('<meta property="og:type" content="website"/>');
    expect(head).toContain('<meta property="og:title" content="Posts"/>');
    expect(head).not.toContain("article:published_time");
  });

  test("description falls back to the site tagline when the entry has no excerpt", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { tagline: "Fallback tagline" });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain(
      '<meta name="description" content="Fallback tagline"/>',
    );
  });

  test("og:image is absent and the card downgrades when no default image is set", async () => {
    const h = await createHarness();
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).not.toContain('property="og:image"');
    expect(head).toContain('<meta name="twitter:card" content="summary"/>');
  });

  test("a search-results route emits noindex", async () => {
    const h = await createHarness();

    const head = await dispatchHead(h, "https://cms.example/search/anything");

    expect(head).toContain('<meta name="robots" content="noindex,follow"/>');
    expect(head).toContain(
      '<meta property="og:title" content="Search: anything"/>',
    );
  });

  test("a theme-set head field wins and is not duplicated", async () => {
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, seo()],
      theme: defineTheme({
        templates: [fallback(() => null)],
        document: {
          meta: [{ property: "og:site_name", content: "From Theme" }],
        },
      }),
    });
    await seedSettings(h, "site", { title: "Demo" });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head.match(/property="og:site_name"/g)).toHaveLength(1);
    expect(head).toContain(
      '<meta property="og:site_name" content="From Theme"/>',
    );
  });

  test("another subscriber's tag wins however the config orders the two", async () => {
    const custom = definePlugin("custom-head", (ctx) => {
      ctx.addFilter("render:document", (manifest) => ({
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { name: "description", content: "Written by another plugin" },
        ],
      }));
    });

    for (const plugins of [
      [blogPlugin, seo(), custom],
      [blogPlugin, custom, seo()],
    ]) {
      const h = await createDispatcherHarness({ plugins, theme });
      await seedSettings(h, "site", { tagline: "A tagline" });
      await seedPost(h, { excerpt: "My excerpt" });

      const head = await dispatchHead(h, "https://cms.example/post/hello");

      expect(head.match(/name="description"/g)).toHaveLength(1);
      expect(head).toContain(
        '<meta name="description" content="Written by another plugin"/>',
      );
    }
  });

  test("no head meta at all without the plugin installed", async () => {
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    await seedSettings(h, "site", { title: "Demo" });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).not.toContain('name="description"');
    expect(head).not.toContain('name="robots"');
    expect(head).not.toContain('property="og:');
    // Core still declares where the page lives.
    expect(head).toContain('rel="canonical"');
  });
});

describe("the og:image chain", () => {
  const card = definePlugin("og-card-test", (ctx) => {
    ctx.addFilter("seo:og_image", () => ({
      url: "https://cms.example/card.png",
      width: 1200,
      height: 630,
    }));
  });

  test("a subscriber's image outranks the site default", async () => {
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, seo(), card],
      theme,
    });
    await seedSettings(h, "seo", {
      default_og_image: "https://cms.example/og.png",
    });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain(
      '<meta property="og:image" content="https://cms.example/card.png"/>',
    );
    expect(head).toContain('<meta property="og:image:width" content="1200"/>');
    expect(head).toContain('<meta property="og:image:height" content="630"/>');
    expect(head).toContain(
      '<meta name="twitter:image" content="https://cms.example/card.png"/>',
    );
  });

  test("the order holds however the config lists the two plugins", async () => {
    for (const plugins of [
      [blogPlugin, seo(), card],
      [blogPlugin, card, seo()],
    ]) {
      const h = await createDispatcherHarness({ plugins, theme });
      await seedSettings(h, "seo", {
        default_og_image: "https://cms.example/og.png",
      });
      await seedPost(h);

      const head = await dispatchHead(h, "https://cms.example/post/hello");

      expect(head).toContain(
        '<meta property="og:image" content="https://cms.example/card.png"/>',
      );
    }
  });
});

describe("legacy site settings", () => {
  test("a site that had turned indexing off keeps it off", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { public: false });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain('<meta name="robots" content="noindex,nofollow"/>');
  });

  test("the legacy default social image still resolves", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", {
      default_og_image: "https://cms.example/legacy.png",
    });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain(
      '<meta property="og:image" content="https://cms.example/legacy.png"/>',
    );
  });

  test("the plugin's own key wins once it is set", async () => {
    const h = await createHarness();
    await seedSettings(h, "site", { public: false });
    await seedSettings(h, "seo", { indexable: true });
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain(
      '<meta name="robots" content="index,follow,max-image-preview:large"/>',
    );
  });
});

describe("per-entry overrides", () => {
  test("a search title replaces the page title and og:title", async () => {
    const h = await createHarness();
    await seedPost(h, { meta: { seo_title: "How to knead dough" } });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain("<title>How to knead dough</title>");
    expect(head).toContain(
      '<meta property="og:title" content="How to knead dough"/>',
    );
  });

  test("a search description replaces the excerpt", async () => {
    const h = await createHarness();
    await seedPost(h, {
      excerpt: "My excerpt",
      meta: { seo_description: "Written for the SERP" },
    });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head.match(/name="description"/g)).toHaveLength(1);
    expect(head).toContain(
      '<meta name="description" content="Written for the SERP"/>',
    );
    expect(head).toContain(
      '<meta property="og:description" content="Written for the SERP"/>',
    );
  });

  test("a canonical override replaces the derived URL, tag and og:url", async () => {
    const h = await createHarness();
    await seedPost(h, {
      meta: { seo_canonical: "https://syndicated.example/original" },
    });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head.match(/rel="canonical"/g)).toHaveLength(1);
    expect(head).toContain(
      '<link rel="canonical" href="https://syndicated.example/original"/>',
    );
    expect(head).toContain(
      '<meta property="og:url" content="https://syndicated.example/original"/>',
    );
  });

  test("no override leaves core's own canonical in place", async () => {
    const h = await createHarness();
    await seedPost(h);

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head.match(/rel="canonical"/g)).toHaveLength(1);
    expect(head).toContain(
      '<link rel="canonical" href="https://cms.example/post/hello"/>',
    );
  });

  test("an entry marked noindex says so in the head", async () => {
    const h = await createHarness();
    await seedPost(h, { meta: { seo_noindex: true } });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain('<meta name="robots" content="noindex,follow"/>');
  });

  test("nofollow rides alongside, index or not", async () => {
    const h = await createHarness();
    await seedPost(h, { slug: "one", meta: { seo_nofollow: true } });
    await seedPost(h, {
      slug: "two",
      meta: { seo_nofollow: true, seo_noindex: true },
    });

    expect(await dispatchHead(h, "https://cms.example/post/one")).toContain(
      '<meta name="robots" content="index,nofollow,max-image-preview:large"/>',
    );
    expect(await dispatchHead(h, "https://cms.example/post/two")).toContain(
      '<meta name="robots" content="noindex,nofollow"/>',
    );
  });

  test("an entry social image outranks a generated card and the site default", async () => {
    const card = definePlugin("og-card-test", (ctx) => {
      ctx.addFilter("seo:og_image", () => ({
        url: "https://cms.example/card.png",
      }));
    });
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, seo(), card],
      theme,
    });
    await seedSettings(h, "seo", {
      default_og_image: "https://cms.example/og.png",
    });
    await seedPost(h, {
      meta: { seo_og_image: "https://cms.example/chosen.png" },
    });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain(
      '<meta property="og:image" content="https://cms.example/chosen.png"/>',
    );
    expect(head).toContain(
      '<meta name="twitter:card" content="summary_large_image"/>',
    );
  });

  test("a term carries the same fields as an entry", async () => {
    const h = await createHarness();
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
      meta: {
        seo_title: "All the news",
        seo_description: "Everything filed under news",
        seo_noindex: true,
      },
    });

    const head = await dispatchHead(h, "https://cms.example/category/news");

    expect(head).toContain("<title>All the news</title>");
    expect(head).toContain(
      '<meta name="description" content="Everything filed under news"/>',
    );
    expect(head).toContain('<meta name="robots" content="noindex,follow"/>');
  });

  test("a search title goes through the theme's title template", async () => {
    const h = await createDispatcherHarness({
      plugins: [blogPlugin, seo()],
      theme: defineTheme({
        templates: [fallback(() => null)],
        document: { titleTemplate: "%s · Demo" },
      }),
    });
    await seedPost(h, { meta: { seo_title: "How to knead dough" } });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    // The override is the page's title, so it composes like one. A page with
    // no override sets no `title` at all and keeps core's own fallback.
    expect(head).toContain("<title>How to knead dough · Demo</title>");
  });

  test("a private site outranks an entry that set nothing", async () => {
    const h = await createHarness();
    await seedSettings(h, "seo", { indexable: false });
    await seedPost(h, { meta: { seo_noindex: false } });

    const head = await dispatchHead(h, "https://cms.example/post/hello");

    expect(head).toContain('<meta name="robots" content="noindex,nofollow"/>');
  });
});
