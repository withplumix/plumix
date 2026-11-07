import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { buildEntryPermalink } from "../../src/route/permalink.js";
import { testSite } from "../../src/test/site.js";

const hierarchicalPagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
    });
  },
});

const site = await testSite({ plugins: [hierarchicalPagesPlugin] });

describe("a hierarchical page's url", () => {
  test("top-level /<base>/leaf resolves the entry with no parent", async () => {
    await site.factory.published.create({
      type: "page",
      slug: "about",
      title: "About",
      parentId: null,
    });

    const page = await site.visit("/page/about");

    page.assertOk().assertSee("<h1>About</h1>");
  });

  test("nested /<base>/parent/leaf resolves the entry by walking the chain", async () => {
    const about = await site.factory.published.create({
      type: "page",
      slug: "about",
      title: "About",
      parentId: null,
    });
    const team = await site.factory.published.create({
      type: "page",
      slug: "team",
      title: "Team",
      parentId: about.id,
    });
    await site.factory.published.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      parentId: team.id,
    });

    const page = await site.visit("/page/about/team/leadership");

    page.assertOk().assertSee("<h1>Leadership</h1>");
  });

  test("URL with mismatched ancestor returns 404", async () => {
    const about = await site.factory.published.create({
      type: "page",
      slug: "about",
      title: "About",
      parentId: null,
    });
    await site.factory.published.create({
      type: "page",
      slug: "team",
      title: "Team",
      parentId: about.id,
    });

    // "team" exists under "about", not under "wrong" — chain mismatch.
    const page = await site.visit("/page/wrong/team");

    page.assertNotFound();
  });

  test("buildEntryPermalink round-trips through the route map (closes permalink.ts:21-26 gap)", async () => {
    const about = await site.factory.published.create({
      type: "page",
      slug: "about",
      title: "About",
      parentId: null,
    });
    const team = await site.factory.published.create({
      type: "page",
      slug: "team",
      title: "Team",
      parentId: about.id,
    });
    const leadership = await site.factory.published.create({
      type: "page",
      slug: "leadership",
      title: "Leadership",
      parentId: team.id,
    });

    const url = await buildEntryPermalink(site.context, {
      type: "page",
      slug: leadership.slug,
      parentId: leadership.parentId,
    });
    expect(url).toBe("/page/about/team/leadership");

    const page = await site.visit(url ?? "");
    page.assertOk().assertSee("<h1>Leadership</h1>");
  });

  test("top-level URL with extra ancestor segments returns 404", async () => {
    // "about" is top-level (no parent). /page/foo/about should 404 —
    // it claims "about" has parent "foo", which is wrong.
    await site.factory.published.create({
      type: "page",
      slug: "about",
      title: "About",
      parentId: null,
    });

    const page = await site.visit("/page/foo/about");

    page.assertNotFound();
  });
});
