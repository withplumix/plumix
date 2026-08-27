import type {
  AnyPluginDescriptor,
  ConnectedObjectStorage,
  JsonObject,
  Logger,
} from "plumix";
import type { ThemeTokens } from "plumix/blocks";
import type { DispatcherHarness } from "plumix/test";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
  defineTheme,
  fallback,
  memoryStorage,
} from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";

import type { CardRule } from "../card.js";
import type { OgPluginOptions } from "../index.js";
import { og } from "../index.js";
import { createFakeRenderer } from "./fake-renderer.js";

// A host plugin registering the shapes a card has to tell apart: a public type,
// a private one, and three access-policied ones — gated by the type, gated by
// the entry's own choice, and behind a *soft* gate whose page a scraper still
// reaches.
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "posts" },
    });
    ctx.registerEntryType("secret", { label: "Secrets", isPublic: false });
    ctx.registerEntryType("gated", {
      label: "Gated",
      isPublic: true,
      access: { default: authenticatedPolicy },
    });
    ctx.registerEntryType("column", {
      label: "Columns",
      isPublic: true,
      access: {
        default: anonymousPolicy,
        policies: [
          {
            key: "members",
            label: "Members only",
            policy: authenticatedPolicy,
          },
        ],
      },
    });
    ctx.registerEntryType("teaser", {
      label: "Teasers",
      isPublic: true,
      access: {
        default: definePolicy({
          resolve: () => challenge("subscribe", { soft: true }),
        }),
      },
    });
  },
});

export interface HarnessOptions extends OgPluginOptions {
  /**
   * The bucket the app connects — pass a seeded one to read out of it, or
   * `null` for a deploy that declared no storage at all.
   */
  readonly storage?: ConnectedObjectStorage | null;
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
   * Cards the theme declares, ahead of the plugin's own default. Supplying
   * either these or {@link HarnessOptions.tokens} swaps the harness's default
   * theme for a bare one, so a page renders its head and nothing else.
   */
  readonly cards?: readonly CardRule[];
  /** Design tokens the theme declares. */
  readonly tokens?: ThemeTokens;
}

/** A fresh in-memory bucket, which is what a harness gets unless told otherwise. */
function bucket(): ConnectedObjectStorage {
  return memoryStorage().connect({});
}

/** An app with the plugin installed, rendering through the fake renderer. */
export async function createHarness(
  options: HarnessOptions = {},
): Promise<DispatcherHarness> {
  const {
    storage,
    withSiteTitle = true,
    assets,
    siteDefaultImage,
    logger,
    before = [],
    cards,
    tokens,
    ...rest
  } = options;
  const harness = await createDispatcherHarness({
    plugins: [
      testBlog,
      ...before,
      og({ renderer: createFakeRenderer().renderer, ...rest }),
    ],
    storage: storage === null ? undefined : (storage ?? bucket()),
    assets,
    logger,
    ...(cards === undefined && tokens === undefined
      ? {}
      : {
          theme: defineTheme({
            templates: [fallback(() => null)],
            ogCards: cards,
            tokens,
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
  /** Written verbatim — a per-entry access choice, a media row's own fields. */
  readonly meta?: JsonObject;
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
    ...(overrides.meta === undefined ? {} : { meta: overrides.meta }),
  });
  return entry.id;
}

export interface SeedMediaOverrides {
  readonly status?: "published" | "draft";
  readonly mime?: string;
}

/**
 * A media row pointing at `storageKey`, in the shape the media plugin writes:
 * what its serve route resolves an id through.
 */
export function seedMedia(
  harness: DispatcherHarness,
  storageKey: string,
  overrides: SeedMediaOverrides = {},
): Promise<number> {
  return seedEntry(harness, {
    type: "media",
    title: "Hero",
    ...(overrides.status === undefined ? {} : { status: overrides.status }),
    meta: { storageKey, mime: overrides.mime ?? "image/png", size: 6 },
  });
}
