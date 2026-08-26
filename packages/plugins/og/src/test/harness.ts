import type { AnyPluginDescriptor, Logger } from "plumix";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback, memoryStorage } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";

import type { CardRule } from "../card.js";
import type { OgPluginOptions } from "../index.js";
import { og } from "../index.js";
import { createFakeRenderer } from "./fake-renderer.js";

// A host plugin registering one public entry type and one private one, so the
// harness app has both a shareable page and an unshareable one.
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "posts" },
    });
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
  },
});

export interface HarnessOptions extends OgPluginOptions {
  readonly withStorage?: boolean;
  readonly withSiteTitle?: boolean;
  readonly assets?: { fetch: (request: Request) => Promise<Response> };
  /** Seeds `site.default_og_image`, the last link of the precedence chain. */
  readonly siteDefaultImage?: string;
  /** Capture what the request reported; silent by default. */
  readonly logger?: Logger;
  /**
   * Plugins installed ahead of this one, so their hook subscribers sit earlier
   * on a filter chain than the card's.
   */
  readonly before?: readonly AnyPluginDescriptor[];
  /**
   * Cards the theme declares, ahead of the plugin's own default. Supplying any
   * swaps the harness's default theme for a bare one, so a page renders its
   * head and nothing else.
   */
  readonly cards?: readonly CardRule[];
}

/** An app with the plugin installed, rendering through the fake renderer. */
export async function createHarness(
  options: HarnessOptions = {},
): Promise<DispatcherHarness> {
  const {
    withStorage = true,
    withSiteTitle = true,
    assets,
    siteDefaultImage,
    logger,
    before = [],
    cards,
    ...rest
  } = options;
  const harness = await createDispatcherHarness({
    plugins: [
      testBlog,
      ...before,
      og({ renderer: createFakeRenderer().renderer, ...rest }),
    ],
    storage: withStorage ? memoryStorage().connect({}) : undefined,
    assets,
    logger,
    ...(cards === undefined
      ? {}
      : {
          theme: defineTheme({
            templates: [fallback(() => null)],
            ogCards: cards,
          }),
        }),
  });
  if (withSiteTitle) {
    await harness.factory.setting.create({
      group: "site",
      key: "title",
      value: "Example Site",
    });
  }
  if (siteDefaultImage !== undefined) {
    await harness.factory.setting.create({
      group: "site",
      key: "default_og_image",
      value: siteDefaultImage,
    });
  }
  return harness;
}

export interface SeedEntryOverrides {
  readonly title?: string;
  readonly slug?: string;
  readonly status?: "published" | "draft";
  readonly type?: string;
}

export async function seedEntry(
  harness: DispatcherHarness,
  overrides: SeedEntryOverrides = {},
): Promise<number> {
  const author = await harness.factory.user.create({});
  const entry = await harness.factory.entry.create({
    type: overrides.type ?? "post",
    title: overrides.title ?? "Hello World",
    ...(overrides.slug === undefined ? {} : { slug: overrides.slug }),
    status: overrides.status ?? "published",
    authorId: author.id,
  });
  return entry.id;
}
