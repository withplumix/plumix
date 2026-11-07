import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
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

const theme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) => <article>{data.entry.title}</article>),
  ],
});

const site = await testSite({ plugins: [blogPlugin], config: { theme } });

describe("the admin bar on a public render", () => {
  test("authenticated public render carries the PlumixAdminBar empty shell", async () => {
    const admin = await site.factory.user.create({ role: "admin" });
    await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: admin.id,
    });

    const page = await site.actingAs(admin).visit("/post/public");

    page.assertSee('data-testid="plumix-admin-bar"');
  });

  test("edit-mode render does NOT carry the PlumixAdminBar", async () => {
    const admin = await site.factory.user.create({ role: "admin" });
    await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: admin.id,
    });

    // In the canvas the bar's injected `body { padding-top }` drives a
    // runaway height loop against the theme's `min-h-screen`.
    const page = await site.actingAs(admin).visit("/post/public?plumix.edit");

    page
      .assertSee('data-plumix-mode="edit"')
      .assertDontSee('data-testid="plumix-admin-bar"');
  });

  test("anonymous public render does NOT carry the PlumixAdminBar", async () => {
    await site.factory.published.create({ slug: "public", title: "Public" });

    const page = await site.visit("/post/public");

    page.assertDontSee('data-testid="plumix-admin-bar"');
  });
});

describe("the admin bar's Edit link follows canEditEntry", () => {
  test("an author viewing their own post is offered Edit", async () => {
    const viewer = await site.factory.user.create({ role: "author" });
    const post = await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: viewer.id,
    });

    const page = await site.actingAs(viewer).visit("/post/public");

    page.assertSee(
      `href="/_plumix/admin/entries/posts/${String(post.id)}/edit"`,
    );
  });

  test("an author viewing another author's post is not offered Edit", async () => {
    const viewer = await site.factory.user.create({ role: "author" });
    const other = await site.factory.user.create({ role: "author" });
    const post = await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: other.id,
    });

    const page = await site.actingAs(viewer).visit("/post/public");

    page
      .assertSee('data-testid="plumix-admin-bar"')
      .assertDontSee(`/_plumix/admin/entries/posts/${String(post.id)}/edit`);
  });

  test("an editor viewing another author's post is offered Edit", async () => {
    const viewer = await site.factory.user.create({ role: "editor" });
    const other = await site.factory.user.create({ role: "author" });
    const post = await site.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: other.id,
    });

    const page = await site.actingAs(viewer).visit("/post/public");

    page.assertSee(
      `href="/_plumix/admin/entries/posts/${String(post.id)}/edit"`,
    );
  });
});

const projected = { en: "en", "de-AT": "de" };

const regional = await testSite({
  plugins: [blogPlugin],
  config: { theme, i18n: { defaultLocale: "en", locales: ["en", "de-AT"] } },
  build: {
    catalogLocales: {
      blocks: projected,
      mail: projected,
      welcome: projected,
      "admin-bar": projected,
    },
  },
});

describe("the admin bar for a user with a regional locale", () => {
  test("the admin bar reads a de-AT user's locale through the build's projection", async () => {
    const admin = await regional.factory.user.create({
      role: "admin",
      meta: { locale: "de-AT" },
    });
    await regional.factory.published.create({
      slug: "public",
      title: "Public",
      authorId: admin.id,
    });

    const page = await regional.actingAs(admin).visit("/post/public");

    page.assertSee('data-testid="plumix-admin-bar" dir="ltr" lang="de-AT"');
  });
});
