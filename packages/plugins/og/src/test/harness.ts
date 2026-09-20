import type { AnyPluginDescriptor, I18nInput, JsonObject } from "plumix";
import type { ThemeTokens } from "plumix/blocks";
import type { Logger, LookupAdapter, OgImage } from "plumix/plugin";
import type {
  ConnectedCdn,
  ConnectedObjectStorage,
  ImageDelivery,
} from "plumix/runtime";
import type {
  DispatcherHarness,
  HarnessFetchOptions,
  TestResponse,
} from "plumix/test";
import {
  anonymousPolicy,
  authenticatedPolicy,
  challenge,
  definePolicy,
} from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { memoryStorage } from "plumix/runtime";
import { createDispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix/theme";

import { seo } from "@plumix/plugin-seo";

import type { CardTarget } from "../card-target.js";
import type { CardRule } from "../card.js";
import type { OgPluginOptions } from "../index.js";
import { cardTargetPath } from "../card-target.js";
import { og } from "../index.js";
import { createFakeRenderer } from "./fake-renderer.js";

export { DEV_ORIGIN } from "plumix/test";

/** The role-tagged fields {@link seedEntry} writes through. */
const FEATURED_GROUP_KEY = "social";
const FEATURED_KEY = "hero";
const OG_IMAGE_KEY = "shareImage";

/** The reference kind the harness's role fields point at. */
const PHOTO_KIND = "photo";

/** What {@link photoAdapter} hydrates an id to — the shape its `image()` reads. */
interface PhotoReference {
  readonly id: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
}

// Where `seedEntry` files the picture it was handed, so a role field stores
// the bare id a real reference stores and the adapter hands the row back. Ids
// are never reused, so a photo left behind by an earlier test is simply never
// asked for again.
const photos = new Map<string, PhotoReference>();
let nextPhoto = 0;

/**
 * The meta a `.featured()` photo is stored as: a bare reference id, in the
 * group the role field sits in. Exported so a suite writing meta through the
 * entry RPC writes the same shape {@link seedEntry} does.
 */
export function featuredMeta(image: OgImage): JsonObject {
  return { [FEATURED_GROUP_KEY]: { [FEATURED_KEY]: filePhoto(image) } };
}

function filePhoto(image: OgImage): string {
  const id = `photo-${String(++nextPhoto)}`;
  photos.set(id, {
    id,
    url: image.url,
    // A media row carries null on both axes until something measures it.
    width: image.width ?? null,
    height: image.height ?? null,
  });
  return id;
}

const filedPhotos = (ids: readonly string[] = []): PhotoReference[] =>
  ids.flatMap((id) => {
    const photo = photos.get(id);
    return photo === undefined ? [] : [photo];
  });

const photoAdapter = {
  // A write validates a reference id by listing it, so an id `filePhoto` never
  // handed out is refused where a real missing row would be.
  list: (_ctx, { ids }) =>
    Promise.resolve(filedPhotos(ids).map(({ id }) => ({ id, label: id }))),
  hydrate: (_ctx, { ids }) => Promise.resolve(filedPhotos(ids)),
  image: ({ url, width, height }: PhotoReference) =>
    width !== null && height !== null
      ? { url, alt: null, width, height }
      : { url, alt: null },
} satisfies LookupAdapter;

// A host plugin registering the shapes a card has to tell apart: a public type,
// a private one, and three access-policied ones — gated by the type, gated by
// the entry's own choice, and behind a *soft* gate whose page a scraper still
// reaches. The role-tagged media fields the precedence chain reads hang off the
// public type; they point at {@link photoAdapter} rather than at the media
// plugin's own kind, since what the chain reads is the role and the image an
// adapter makes of its payload — which keeps this suite off a second plugin.
const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
      rewrite: { slug: "posts" },
      // As `@plumix/plugin-blog` declares it: an editor's meta edits on a
      // *published* post of a type supporting autosave land on a per-user
      // draft row rather than the live one, which anything rendering what an
      // author is editing has to account for.
      supports: ["title", "editor", "autosave"],
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
    // A type whose *archive* is gated: `policyForMatch` resolves an archive
    // intent against the type's `access.default`, so its listing page redirects
    // an anonymous visitor and its card has to refuse them too.
    ctx.registerEntryType("memo", {
      label: "Memos",
      isPublic: true,
      hasArchive: true,
      access: { default: authenticatedPolicy },
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
    // A public taxonomy and a private one, so a term card can be asked for on
    // both sides of the reachability line the route draws.
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
    ctx.registerTermTaxonomy("mood", {
      label: "Moods",
      entryTypes: ["post"],
      isPublic: false,
    });
    ctx.registerLookupAdapter({
      kind: PHOTO_KIND,
      capability: null,
      adapter: photoAdapter,
    });
    ctx.registerEntryMetaBox("social", {
      label: "Social",
      entryTypes: ["post"],
      fields: [
        // Nested in a group, which is where an appearance box tends to put it
        // — and the shape the field walk this chain used to do could not see.
        {
          key: FEATURED_GROUP_KEY,
          label: "Social",
          type: "json",
          inputType: "group",
          fields: [
            {
              key: FEATURED_KEY,
              label: "Hero",
              type: "json",
              inputType: "media",
              referenceTarget: { kind: PHOTO_KIND },
              role: "featured",
            },
          ],
        },
        {
          key: OG_IMAGE_KEY,
          label: "Share image",
          type: "json",
          inputType: "media",
          referenceTarget: { kind: PHOTO_KIND },
          role: "ogImage",
        },
      ],
    });
  },
});

export interface HarnessOptions extends OgPluginOptions {
  /**
   * The bucket the app connects — pass a seeded one to read out of it, or
   * `null` for a deploy that declared no storage at all.
   */
  readonly storage?: ConnectedObjectStorage | null;
  /** The CDN the deploy bound; omitted, the route runs live. */
  readonly cdn?: ConnectedCdn;
  readonly withSiteTitle?: boolean;
  readonly assets?: { fetch: (request: Request) => Promise<Response> };
  /** Seeds the SEO plugin's default image, the last link of the chain. */
  readonly siteDefaultImage?: string;
  /** Capture what the request reported; silent by default. */
  readonly logger?: Logger;
  /** The `imageDelivery:` slot, which is what crops a featured photo. */
  readonly imageDelivery?: ImageDelivery;
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
  /** Serve the site under a subdirectory, as a mounted deploy does. */
  readonly basePath?: string;
  /** Locales the site enables, for asserting a card ignores them. */
  readonly i18n?: I18nInput;
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
    cdn,
    withSiteTitle = true,
    assets,
    siteDefaultImage,
    logger,
    imageDelivery,
    before = [],
    cards,
    tokens,
    basePath,
    i18n,
    ...rest
  } = options;
  const harness = await createDispatcherHarness({
    // The head this suite asserts is written by `@plumix/plugin-seo`, which
    // also owns the `og:image` chain this plugin contributes one link of.
    plugins: [
      testBlog,
      seo(),
      ...before,
      og({ renderer: createFakeRenderer().renderer, ...rest }),
    ],
    storage: storage === null ? undefined : (storage ?? bucket()),
    cdn,
    assets,
    basePath,
    i18n,
    logger,
    imageDelivery,
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
      group: "seo",
      key: "default_og_image",
      value: siteDefaultImage,
    });
  }
  return harness;
}

/** A bare number reads as the entry it is, which is what most of the suite asks for. */
function targetOf(target: number | CardTarget): CardTarget {
  return typeof target === "number" ? { kind: "entry", id: target } : target;
}

/**
 * Where one page's card is served, found the way anything that isn't already
 * holding the URL has to find it: through the digest-less pointer, which names
 * whichever render is current.
 */
export async function cardPath(
  harness: DispatcherHarness,
  target: number | CardTarget,
  extension = "svg",
  basePath = "",
): Promise<string> {
  const named = cardTargetPath(targetOf(target));
  const pointer = `${basePath}/_plumix/og/card/${named}.${extension}`;
  const location = (await harness.fetch(pointer)).headers.get("location");
  // Nothing to point at — a draft, an unserved format, an entry nobody may
  // see. The pointer's own 404 is then what a caller fetches, which is the
  // answer they were asking for.
  return location === null ? pointer : new URL(location).pathname;
}

/** The card itself. */
export async function fetchCard(
  harness: DispatcherHarness,
  target: number | CardTarget,
  options: FetchCardOptions = {},
): Promise<TestResponse> {
  const { extension = "svg", ...init } = options;
  return harness.fetch(await cardPath(harness, target, extension), init);
}

export interface FetchCardOptions extends HarnessFetchOptions {
  /** The format the renderer declares, which the URL names. */
  readonly extension?: string;
}

export interface SeedEntryOverrides {
  readonly title?: string;
  readonly slug?: string;
  readonly status?: "published" | "draft";
  readonly type?: string;
  /** Whose byline, for a suite asking about an author archive. */
  readonly authorId?: number;
  /** When, for a suite asking about a date archive. */
  readonly publishedAt?: Date;
  /** Written verbatim — a per-entry access choice, a media row's own fields. */
  readonly meta?: JsonObject;
  /** The entry's `.featured()` photo — the link above a generated card. */
  readonly featured?: OgImage;
  /** The entry's explicit `.ogImage()` choice — the top of the chain. */
  readonly shareImage?: OgImage;
}

export async function seedEntry(
  harness: DispatcherHarness,
  overrides: SeedEntryOverrides = {},
): Promise<number> {
  const authorId =
    overrides.authorId ?? (await harness.factory.user.create({})).id;
  const { featured, shareImage } = overrides;
  const entry = await harness.factory.entry.create({
    type: overrides.type ?? "post",
    title: overrides.title ?? "Hello World",
    ...(overrides.slug === undefined ? {} : { slug: overrides.slug }),
    ...(overrides.publishedAt === undefined
      ? {}
      : { publishedAt: overrides.publishedAt }),
    status: overrides.status ?? "published",
    meta: {
      ...overrides.meta,
      ...(featured === undefined ? {} : featuredMeta(featured)),
      ...(shareImage === undefined
        ? {}
        : { [OG_IMAGE_KEY]: filePhoto(shareImage) }),
    },
    authorId,
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

/** A term in `category`, with `entryIds` filed under it. */
export async function seedTerm(
  harness: DispatcherHarness,
  overrides: SeedTermOverrides = {},
): Promise<number> {
  const term = await harness.factory.term.create({
    taxonomy: overrides.taxonomy ?? "category",
    name: overrides.name ?? "Design",
    slug: overrides.slug ?? "design",
  });
  for (const entryId of overrides.entryIds ?? []) {
    await harness.factory.entryTerm.create({ entryId, termId: term.id });
  }
  return term.id;
}

export interface SeedTermOverrides {
  readonly taxonomy?: string;
  readonly name?: string;
  readonly slug?: string;
  /** Entries filed under the term, which is what makes its archive non-empty. */
  readonly entryIds?: readonly number[];
}

/** The rendered head of one post, which is what the chain is asserted through. */
export function headOf(
  harness: DispatcherHarness,
  slug: string,
): Promise<string> {
  return harness.fetch(`/posts/${slug}`).then((response) => response.text());
}

/** The one `og:image` a head carries, or undefined — a readable diff on failure. */
export function ogImageOf(html: string): string | undefined {
  return /<meta property="og:image" content="([^"]*)"\/>/.exec(html)?.[1];
}
