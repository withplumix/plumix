import { createElement } from "react";
import { describe, test } from "vitest";

import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  fallback,
  forEntryType,
  NAMED_TEMPLATE_META_KEY,
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

const siteTitleShortcodePlugin = definePlugin("site-title", {
  setup: (ctx) => {
    ctx.registerShortcode({
      name: "site-title",
      render: ({ context }) => {
        const title = context.siteSettings.title;
        return typeof title === "string" ? title : "";
      },
    });
  },
});

const YEAR = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
  new Date(),
);

const TIPTAP_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }],
};

const site = await testSite({
  plugins: [blogPlugin, siteTitleShortcodePlugin],
});

describe("a single entry's url", () => {
  test("renders title + walked content for a published post", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Hello & <world>",
      content: TIPTAP_BODY,
    });

    const page = await site.visit("/post/hello");

    page
      .assertOk()
      .assertSee("<title>Hello &amp; &lt;world&gt;</title>")
      .assertSee("<h1>Hello &amp; &lt;world&gt;</h1>")
      .assertSee("<p>Body.</p>");
  });

  test("expands a [year] shortcode in the entry title", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "shoes",
      title: "Best Shoes for [year]",
      content: TIPTAP_BODY,
    });

    const page = await site.visit("/post/shoes");

    page.assertSee(`<h1>Best Shoes for ${YEAR}</h1>`);
  });

  test("a title shortcode reads the configured site settings", async () => {
    await site.factory.setting.create({
      group: "site",
      key: "title",
      value: "Acme",
    });
    await site.factory.published.create({
      type: "post",
      slug: "about",
      title: "About [site-title]",
      content: TIPTAP_BODY,
    });

    const page = await site.visit("/post/about");

    page.assertSee("<h1>About Acme</h1>");
  });

  test("keeps an escaped shortcode in an untouched title literal", async () => {
    await site.factory.published.create({
      type: "post",
      slug: "escaped",
      title: "Write [[year]] for the year",
      content: TIPTAP_BODY,
    });

    const page = await site.visit("/post/escaped");

    page.assertSee("<h1>Write [year] for the year</h1>");
  });

  test("draft with a matching slug returns 404 (status gate)", async () => {
    await site.factory.draft.create({
      type: "post",
      slug: "secret",
      title: "Secret",
    });

    const page = await site.visit("/post/secret");

    page
      .assertNotFound()
      .assertHeader("x-plumix-hint", "public-post-not-found");
  });

  test("trashed post returns 404", async () => {
    await site.factory.trashed.create({
      type: "post",
      slug: "gone",
      title: "Gone",
    });

    const page = await site.visit("/post/gone");

    page.assertNotFound();
  });
});

const retitle = definePlugin("retitle", {
  setup: (ctx) => {
    ctx.filters.add(render.single, (data) => ({
      ...data,
      entry: { ...data.entry, title: "Retitled in [year]" },
    }));
  },
});

const retitled = await testSite({ plugins: [blogPlugin, retitle] });

describe("a single entry's title a render.single handler rewrote", () => {
  test("expands a title a render.single handler rewrote", async () => {
    await retitled.factory.published.create({
      type: "post",
      slug: "shoes",
      title: "Shoes",
      content: TIPTAP_BODY,
    });

    const page = await retitled.visit("/post/shoes");

    page
      .assertSee(`<title>Retitled in ${YEAR}</title>`)
      .assertSee(`<h1>Retitled in ${YEAR}</h1>`);
  });
});

const landingTheme = defineTheme({
  templates: [
    forEntryType("post")
      .named("landing", "Landing")
      .template(() => createElement("h1", null, "LANDING PAGE")),
    fallback(({ data }) =>
      "entry" in data ? createElement("h1", null, data.entry.title) : null,
    ),
  ],
});

const landing = await testSite({
  plugins: [blogPlugin],
  config: { theme: landingTheme },
});

describe("a single entry's saved template choice", () => {
  test("a published entry's saved template choice resolves on the public route", async () => {
    // The choice lives in the live row's meta (as the publish flow persists
    // it).
    await landing.factory.published.create({
      type: "post",
      slug: "promo",
      title: "Promo",
      content: TIPTAP_BODY,
      meta: { [NAMED_TEMPLATE_META_KEY]: "landing" },
    });

    // No preview token — the public route resolves the named template.
    const page = await landing.visit("/post/promo");

    page.assertSee("LANDING PAGE");
  });
});
