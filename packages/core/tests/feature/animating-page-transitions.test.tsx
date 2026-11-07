import { describe, test } from "vitest";

import type { ThemeDescriptor } from "../../src/theme.js";
import { createPreviewToken } from "../../src/auth/preview-token.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  fallback,
  notFound,
} from "../../src/route/render/template-builders.js";
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

const VIEW_TRANSITION_RULE = "@view-transition{navigation:auto}";
const REDUCED_MOTION =
  "@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}";
const DIRECTION_SCRIPT = '<script>addEventListener("pagereveal",';
const HEAD_START =
  '<head><meta charSet="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>';

type ViewTransitionsSetting = Pick<ThemeDescriptor, "viewTransitions">;

/** A theme of a fallback alone, carrying the setting. */
function themeSite(setting: ViewTransitionsSetting) {
  return testSite({
    plugins: [blogPlugin],
    config: {
      theme: defineTheme({ templates: [fallback(() => null)], ...setting }),
    },
  });
}

/** A theme with an entry template, each carrying its own setting. */
function templateSite(
  themeSetting: ViewTransitionsSetting,
  templateSetting: ViewTransitionsSetting,
) {
  return testSite({
    plugins: [blogPlugin],
    config: {
      theme: defineTheme({
        templates: [
          fallback(() => null),
          entry(defineTemplate({ render: () => null, ...templateSetting })),
        ],
        ...themeSetting,
      }),
    },
  });
}

const onSite = await themeSite({ viewTransitions: true });
const unsetSite = await themeSite({});
const typedSite = await themeSite({
  viewTransitions: { enabled: true, types: ["slide", "fade"] },
});
const alwaysSites = [
  ["always", await themeSite({ viewTransitions: "always" })],
  [
    { enabled: "always" },
    await themeSite({ viewTransitions: { enabled: "always" } }),
  ],
] as const;
const offSites = [
  [false, await themeSite({ viewTransitions: false })],
  [
    { enabled: false },
    await themeSite({ viewTransitions: { enabled: false } }),
  ],
] as const;
const packaged = defineTheme({
  templates: [fallback(() => null)],
  viewTransitions: true,
});
const spreadOffSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: { ...packaged, viewTransitions: false } },
});

describe("theme viewTransitions — the head's @view-transition rule", () => {
  test("`true` renders the rule, then the reduced-motion rule after it", async () => {
    await onSite.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await onSite.visit("/post/hello");

    page.assertSee(`<style>${VIEW_TRANSITION_RULE}${REDUCED_MOTION}</style>`);
  });

  test("`true` renders the direction script early in the head, ahead of every stylesheet", async () => {
    await onSite.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await onSite.visit("/post/hello");

    page.assertSee(HEAD_START + DIRECTION_SCRIPT);
  });

  test.each([["nav-forward"], ["nav-back"], ["nav-replace"]])(
    "the direction script adds the %s type",
    async (type) => {
      await onSite.factory.published.create({ slug: "hello", title: "Hello" });

      const page = await onSite.visit("/post/hello");

      page.assertSeeInOrder([DIRECTION_SCRIPT, `"${type}"`, "</script>"]);
    },
  );

  test("a theme without the key renders the head it rendered before", async () => {
    await unsetSite.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await unsetSite.visit("/post/hello");

    page.assertSee(
      HEAD_START +
        "<title>Hello</title>" +
        '<link rel="canonical" href="https://cms.example/post/hello"/>' +
        "</head>",
    );
  });

  test("`{ enabled: true, types }` renders those types in the rule", async () => {
    await typedSite.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await typedSite.visit("/post/hello");

    page.assertSee(
      `<style>@view-transition{navigation:auto;types:slide fade}${REDUCED_MOTION}</style>`,
    );
  });

  test.each(alwaysSites)(
    "%j renders the rule without the reduced-motion rule",
    async (_, site) => {
      await site.factory.published.create({ slug: "hello", title: "Hello" });

      const page = await site.visit("/post/hello");

      page
        .assertSee(`<style>${VIEW_TRANSITION_RULE}</style>`)
        .assertDontSee("prefers-reduced-motion")
        .assertSee(DIRECTION_SCRIPT);
    },
  );

  test.each(offSites)("%j renders nothing", async (_, site) => {
    await site.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await site.visit("/post/hello");

    page.assertDontSee("<style>").assertDontSee("<script>");
  });

  test("a site spreading the theme with `viewTransitions: false` turns it off", async () => {
    await spreadOffSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await spreadOffSite.visit("/post/hello");

    page.assertDontSee("@view-transition").assertDontSee("pagereveal");
  });

  test("a 404 page carries the rule, so navigating to it animates too", async () => {
    const page = await onSite.visit("/never-existed");

    page
      .assertNotFound()
      .assertSee(`<style>${VIEW_TRANSITION_RULE}${REDUCED_MOTION}</style>`)
      .assertSee(DIRECTION_SCRIPT);
  });
});

const entryOffSite = await templateSite(
  { viewTransitions: true },
  { viewTransitions: false },
);
const entryOnSite = await templateSite({}, { viewTransitions: true });
const zoomSite = await templateSite(
  { viewTransitions: { enabled: true, types: ["slide"] } },
  { viewTransitions: { enabled: true, types: ["zoom"] } },
);
const entryAlwaysSite = await templateSite(
  { viewTransitions: true },
  { viewTransitions: "always" },
);
const notFoundOffSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        notFound(
          defineTemplate({ render: () => null, viewTransitions: false }),
        ),
      ],
      viewTransitions: true,
    }),
  },
});

describe("template viewTransitions — replaces the theme's value for its pages", () => {
  test("a template's `false` drops the rule from its pages", async () => {
    await entryOffSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryOffSite.visit("/post/hello");

    page.assertDontSee("@view-transition").assertDontSee("pagereveal");
  });

  test("a template's `false` leaves the rule on other pages", async () => {
    await entryOffSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryOffSite.visit("/post");

    page
      .assertSee(`<style>${VIEW_TRANSITION_RULE}${REDUCED_MOTION}</style>`)
      .assertSee('addEventListener("pagereveal"');
  });

  test("a template's `true` renders the rule on its pages when the theme leaves it off", async () => {
    await entryOnSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryOnSite.visit("/post/hello");

    page
      .assertSee(`<style>${VIEW_TRANSITION_RULE}${REDUCED_MOTION}</style>`)
      .assertSee('addEventListener("pagereveal"');
  });

  test("a template's `true` leaves the rule off other pages", async () => {
    await entryOnSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryOnSite.visit("/post");

    page.assertDontSee("@view-transition").assertDontSee("pagereveal");
  });

  test("a template's types replace the theme's rather than adding to them", async () => {
    await zoomSite.factory.published.create({ slug: "hello", title: "Hello" });

    const page = await zoomSite.visit("/post/hello");

    page.assertSee(
      `<style>@view-transition{navigation:auto;types:zoom}${REDUCED_MOTION}</style>`,
    );
  });

  test('a template\'s `"always"` drops the reduced-motion rule for its pages', async () => {
    await entryAlwaysSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryAlwaysSite.visit("/post/hello");

    page
      .assertSee(`<style>${VIEW_TRANSITION_RULE}</style>`)
      .assertDontSee("prefers-reduced-motion");
  });

  test('a template\'s `"always"` keeps the reduced-motion rule on other pages', async () => {
    await entryAlwaysSite.factory.published.create({
      slug: "hello",
      title: "Hello",
    });

    const page = await entryAlwaysSite.visit("/post");

    page.assertSee(`<style>${VIEW_TRANSITION_RULE}${REDUCED_MOTION}</style>`);
  });

  test("a 404 template's `false` drops the rule from the 404 page", async () => {
    const page = await notFoundOffSite.visit("/never-existed");

    page
      .assertNotFound()
      .assertDontSee("@view-transition")
      .assertDontSee("pagereveal");
  });
});

const neverAnimatedSites = [
  ["the theme's `true`", await templateSite({ viewTransitions: true }, {})],
  [
    'the template\'s `"always"`',
    await templateSite({}, { viewTransitions: "always" }),
  ],
] as const;

describe("edit and preview renders — never animated", () => {
  test.each(neverAnimatedSites)(
    "an edit-mode render carries no rule, whatever %s says",
    async (_, site) => {
      await site.factory.published.create({ slug: "hello", title: "Hello" });

      const page = await site
        .actingAs("admin")
        .visit("/post/hello?plumix.edit");

      page
        .assertSee('data-plumix-mode="edit"')
        .assertDontSee("@view-transition")
        .assertDontSee("pagereveal");
    },
  );

  test.each(neverAnimatedSites)(
    "a preview render carries no rule, whatever %s says",
    async (_, site) => {
      const draft = await site.factory.draft.create({
        slug: "draft",
        title: "Draft",
      });
      const token = await createPreviewToken(site.context.db, {
        entryId: draft.id,
        userId: draft.authorId,
      });

      const page = await site.visit(`/post/draft?preview=${token}`);

      page
        .assertOk()
        .assertSee("<title>Draft</title>")
        .assertDontSee("@view-transition")
        .assertDontSee("pagereveal");
    },
  );
});
