import type { JsonValue } from "plumix";
import type { Label } from "plumix/i18n";
import type {
  AppContext,
  MetaBoxFieldInput,
  PluginSetupContext,
} from "plumix/plugin";
import type { SettingsBag } from "plumix/schema";
import { loadSettingsGroups } from "plumix";
import { tryGetContext } from "plumix/plugin";

import { publicTargets } from "./scope.js";

/** This plugin's settings groups — each one a storage unit and an admin card. */
export const SEO_SETTINGS_GROUP = "seo";
export const SEO_VERIFICATION_GROUP = "seo_verification";
export const SEO_ROBOTS_GROUP = "seo_robots";

// Every group is site-wide configuration, so every one carries the gate the
// settings RPC enforces. A contributor reaching the page sees nothing.
const SETTINGS_CAPABILITY = "settings:manage";

/** The meta name each engine reads its verification token from. */
const VERIFICATION_TAGS = {
  google: "google-site-verification",
  bing: "msvalidate.01",
  yandex: "yandex-verification",
  baidu: "baidu-site-verification",
  pinterest: "p:domain_verify",
} as const;

type VerificationEngine = keyof typeof VERIFICATION_TAGS;

const VERIFICATION_ENGINES = Object.keys(
  VERIFICATION_TAGS,
) as readonly VerificationEngine[];

/**
 * Where each key lived while core owned it. A site that had turned indexing
 * off keeps it off with no migration step: the reads below fall back here, and
 * the admin form is seeded from the same fallback so the next save writes the
 * value through under the new key.
 *
 * Removable at 1.0, along with the seeding filter.
 */
const LEGACY_KEYS = {
  indexable: "public",
  default_og_image: "default_og_image",
} as const;

const D = {
  groupLabel: { id: "plugin.seo.settings.label", message: "Search & social" },
  groupDescription: {
    id: "plugin.seo.settings.description",
    message: "What this site tells search engines and social networks.",
  },
  indexable: {
    id: "plugin.seo.settings.indexable",
    message: "Allow search engines to index this site",
  },
  defaultOgImage: {
    id: "plugin.seo.settings.default_og_image",
    message: "Default social image URL",
  },
  represents: {
    id: "plugin.seo.settings.represents",
    message: "This site represents",
  },
  blockAiCrawlers: {
    id: "plugin.seo.settings.block_ai_crawlers",
    message: "Block AI crawlers",
  },
  blockAiCrawlersDescription: {
    id: "plugin.seo.settings.block_ai_crawlers.description",
    message:
      "Tells the assistants and model trainers that honour robots.txt to stay out.",
  },
  indexNowKey: {
    id: "plugin.seo.settings.indexnow_key",
    message: "IndexNow key",
  },
  indexNowKeyDescription: {
    id: "plugin.seo.settings.indexnow_key.description",
    message:
      "Set one to tell search engines within minutes of a publish. Empty means no notification.",
  },
  pageLabel: { id: "plugin.seo.settings.page.label", message: "SEO" },
  pageDescription: {
    id: "plugin.seo.settings.page.description",
    message: "Site-wide search and social defaults.",
  },
  separator: {
    id: "plugin.seo.settings.separator",
    message: "Title separator",
  },
  separatorDescription: {
    id: "plugin.seo.settings.separator.description",
    message: "What %%sep%% becomes in a title pattern.",
  },
  titlePattern: {
    id: "plugin.seo.settings.title_pattern",
    message: "Default title pattern",
  },
  titlePatternDescription: {
    id: "plugin.seo.settings.title_pattern.description",
    message:
      "Used where no per-type pattern applies. Empty leaves titles as they are.",
  },
  indexSearch: {
    id: "plugin.seo.settings.index_search",
    message: "Index search-results pages",
  },
  indexPaginated: {
    id: "plugin.seo.settings.index_paginated",
    message: "Index page 2 and beyond of an archive",
  },
  indexNotFound: {
    id: "plugin.seo.settings.index_not_found",
    message: "Index pages that were not found",
  },
  thinDescription: {
    id: "plugin.seo.settings.thin.description",
    message: "Off by default — these pages are thin or duplicated.",
  },
  typeTitleDescription: {
    id: "plugin.seo.settings.type_title.description",
    message: "Title pattern for entries of this type.",
  },
  typeIndexableDescription: {
    id: "plugin.seo.settings.type_indexable.description",
    message: "Allow search engines to index entries of this type.",
  },
  taxonomyIndexableDescription: {
    id: "plugin.seo.settings.taxonomy_indexable.description",
    message: "Allow search engines to index this taxonomy's archives.",
  },
  verificationLabel: {
    id: "plugin.seo.settings.verification.label",
    message: "Site verification",
  },
  verificationDescription: {
    id: "plugin.seo.settings.verification.description",
    message:
      "Tokens each search engine hands you to prove you own this site. Every one set reaches the head of every page.",
  },
  robotsLabel: {
    id: "plugin.seo.settings.robots.label",
    message: "robots.txt",
  },
  robotsDescription: {
    id: "plugin.seo.settings.robots.description",
    message:
      "Replaces the generated file. The sitemap line is kept whether or not you write one.",
  },
  robotsField: {
    id: "plugin.seo.settings.robots.body",
    message: "robots.txt content",
  },
} as const satisfies Record<string, Label>;

const VERIFICATION_LABELS = {
  google: { id: "plugin.seo.settings.verification.google", message: "Google" },
  bing: { id: "plugin.seo.settings.verification.bing", message: "Bing" },
  yandex: { id: "plugin.seo.settings.verification.yandex", message: "Yandex" },
  baidu: { id: "plugin.seo.settings.verification.baidu", message: "Baidu" },
  pinterest: {
    id: "plugin.seo.settings.verification.pinterest",
    message: "Pinterest",
  },
} as const satisfies Record<VerificationEngine, Label>;

// The two answers and the schema.org type each names. One roster, so the
// stored value is narrowed against the same list the form offers. The labels
// are vocabulary terms rather than prose — the same word in every language —
// so they are written here rather than sent through the catalogs.
const REPRESENTS = [
  { value: "organization", label: "Organization" },
  { value: "person", label: "Person" },
] as const;

/** What the site says it is, in the one place structured data asks. */
export type SiteRepresents = (typeof REPRESENTS)[number]["value"];

/** The site-wide answers the head, the robots chain and the sitemap need. */
export interface SeoSettings {
  /** False holds the whole site out of the index. */
  readonly indexable: boolean;
  /** The last link of the `og:image` chain, or null. */
  readonly defaultOgImage: string | null;
  /** Who the structured-data graph names as the site's publisher. */
  readonly represents: SiteRepresents;
  /** What `%%sep%%` resolves to. */
  readonly separator: string;
  /** The pattern for a page no per-type one covers, or null for none. */
  readonly titlePattern: string | null;
  /** Per-entry-type title patterns, keyed by type name. */
  readonly typeTitlePatterns: ReadonlyMap<string, string>;
  /**
   * Entry types the site owner defaulted out of the index. Read off the stored
   * keys, not intersected with the registry — a row left by an uninstalled
   * plugin keeps answering, which no page exists for anyway.
   */
  readonly noindexTypes: ReadonlySet<string>;
  readonly noindexTaxonomies: ReadonlySet<string>;
  /** The three thin-page arms, each off by default and each overridable. */
  readonly indexSearch: boolean;
  readonly indexPaginated: boolean;
  readonly indexNotFound: boolean;
  /** True disallows the named AI crawlers in `robots.txt`. */
  readonly blockAiCrawlers: boolean;
  /** The IndexNow key, or null — which is what holds notification off. */
  readonly indexNowKey: string | null;
}

/** What `%%sep%%` resolves to until a site says otherwise. */
const DEFAULT_SEPARATOR = "\u00b7";

// Settings keys are one flat namespace per group, so the per-type answers
// carry their scope in the key. Colons are legal in a field key and read as
// structure where an underscore would collide with a type actually named
// `post_title`.
const TYPE_TITLE = /^type:([^:]+):title$/;
const TYPE_INDEXABLE = /^type:([^:]+):indexable$/;
const TAXONOMY_INDEXABLE = /^taxonomy:([^:]+):indexable$/;

/**
 * A registry name reaches a settings key verbatim, and a meta-box field key is
 * `[a-zA-Z0-9_:-]`. Core validates neither entry-type nor taxonomy names, so a
 * type registered as `my type` would fail the boot naming *this plugin's*
 * settings group rather than the type that caused it. Colons are excluded on
 * top of that, so a name can never be read as key structure.
 */
const KEYABLE_NAME = /^[a-zA-Z0-9_-]+$/;

/** The settings key a type's title pattern is stored under. */
export function typeTitleKey(type: string): string {
  return `type:${type}:title`;
}

/** The settings key a type's indexing default is stored under. */
export function typeIndexableKey(type: string): string {
  return `type:${type}:indexable`;
}

/** The settings key a taxonomy's indexing default is stored under. */
export function taxonomyIndexableKey(taxonomy: string): string {
  return `taxonomy:${taxonomy}:indexable`;
}

/**
 * Fold the two stored bags into the answers every consumer reads.
 *
 * Split from {@link loadSeoSettings} so the per-scope key parsing — the part
 * with a shape to get wrong — is readable without a request.
 */
export function readSeoSettings(
  own: SettingsBag,
  legacy: SettingsBag,
): SeoSettings {
  const typeTitlePatterns = new Map<string, string>();
  const noindexTypes = new Set<string>();
  const noindexTaxonomies = new Set<string>();
  for (const [key, value] of Object.entries(own)) {
    const title = TYPE_TITLE.exec(key);
    if (title?.[1] !== undefined) {
      const pattern = nonEmpty(value);
      if (pattern !== null) typeTitlePatterns.set(title[1], pattern);
      continue;
    }
    // Only an explicit `false` holds a scope out: an unanswered one is in, the
    // same way an unanswered entry is.
    const type = TYPE_INDEXABLE.exec(key);
    if (type?.[1] !== undefined) {
      if (value === false) noindexTypes.add(type[1]);
      continue;
    }
    const taxonomy = TAXONOMY_INDEXABLE.exec(key);
    if (taxonomy?.[1] !== undefined && value === false) {
      noindexTaxonomies.add(taxonomy[1]);
    }
  }
  return {
    indexable:
      boolish(own.indexable) ?? boolish(legacy[LEGACY_KEYS.indexable]) ?? true,
    defaultOgImage:
      nonEmpty(own.default_og_image) ??
      nonEmpty(legacy[LEGACY_KEYS.default_og_image]),
    represents:
      REPRESENTS.find((option) => option.value === own.represents)?.value ??
      REPRESENTS[0].value,
    separator:
      typeof own.title_separator === "string"
        ? own.title_separator
        : DEFAULT_SEPARATOR,
    titlePattern: nonEmpty(own.title_pattern),
    typeTitlePatterns,
    noindexTypes,
    noindexTaxonomies,
    indexSearch: boolish(own.index_search) ?? false,
    indexPaginated: boolish(own.index_paginated) ?? false,
    indexNotFound: boolish(own.index_not_found) ?? false,
    blockAiCrawlers: boolish(own.block_ai_crawlers) ?? false,
    indexNowKey: nonEmpty(own.indexnow_key),
  };
}

const PATTERN_MAX = 200;

// Every field the site answers once, whatever it registered.
const SITE_WIDE_FIELDS: readonly MetaBoxFieldInput[] = [
  {
    key: "indexable",
    type: "boolean",
    inputType: "toggle",
    label: D.indexable,
    default: true,
  },
  {
    key: "default_og_image",
    type: "string",
    inputType: "url",
    label: D.defaultOgImage,
    maxLength: 500,
  },
  {
    key: "represents",
    type: "string",
    inputType: "select",
    label: D.represents,
    default: REPRESENTS[0].value,
    options: REPRESENTS,
  },
  {
    key: "title_separator",
    type: "string",
    inputType: "text",
    label: D.separator,
    description: D.separatorDescription,
    default: DEFAULT_SEPARATOR,
    maxLength: 8,
  },
  {
    key: "title_pattern",
    type: "string",
    inputType: "text",
    label: D.titlePattern,
    description: D.titlePatternDescription,
    maxLength: PATTERN_MAX,
  },
  {
    key: "index_search",
    type: "boolean",
    inputType: "toggle",
    label: D.indexSearch,
    description: D.thinDescription,
    default: false,
  },
  {
    key: "index_paginated",
    type: "boolean",
    inputType: "toggle",
    label: D.indexPaginated,
    description: D.thinDescription,
    default: false,
  },
  {
    key: "index_not_found",
    type: "boolean",
    inputType: "toggle",
    label: D.indexNotFound,
    description: D.thinDescription,
    default: false,
  },
  {
    key: "block_ai_crawlers",
    type: "boolean",
    inputType: "toggle",
    label: D.blockAiCrawlers,
    description: D.blockAiCrawlersDescription,
    default: false,
  },
  {
    key: "indexnow_key",
    type: "string",
    inputType: "text",
    label: D.indexNowKey,
    description: D.indexNowKeyDescription,
    maxLength: 128,
  },
];

/**
 * The per-scope fields, one pair per public entry type and one toggle per
 * public taxonomy.
 *
 * A scope's own registered label is its field label — already translated by
 * whoever registered it, where a descriptor built here could not name it.
 */
function scopeFields(ctx: PluginSetupContext): MetaBoxFieldInput[] {
  // A name that cannot be a key gets no fields, rather than taking the boot
  // down over a type this plugin does not own.
  const keyable = <T extends { readonly name: string }>(targets: T[]): T[] =>
    targets.filter((target) => KEYABLE_NAME.test(target.name));
  return [
    ...keyable(publicTargets(ctx.plugins.entryTypes)).flatMap(
      (type): MetaBoxFieldInput[] => [
        {
          key: typeTitleKey(type.name),
          type: "string",
          inputType: "text",
          label: type.label,
          description: D.typeTitleDescription,
          maxLength: PATTERN_MAX,
        },
        {
          key: typeIndexableKey(type.name),
          type: "boolean",
          inputType: "toggle",
          label: type.label,
          description: D.typeIndexableDescription,
          default: true,
        },
      ],
    ),
    ...keyable(publicTargets(ctx.plugins.termTaxonomies)).map(
      (taxonomy): MetaBoxFieldInput => ({
        key: taxonomyIndexableKey(taxonomy.name),
        type: "boolean",
        inputType: "toggle",
        label: taxonomy.label,
        description: D.taxonomyIndexableDescription,
        default: true,
      }),
    ),
  ];
}

// Long enough for a token and for a hand-written crawler policy; the caps are
// against an adversarial payload, not an editorial rule.
const TOKEN_MAX = 300;
const ROBOTS_MAX = 8000;

export function registerSeoSettings(ctx: PluginSetupContext): void {
  // Deferred to `theme:ready` for the same reason the meta box is: the
  // per-scope fields are read off the registry, which during `setup` holds
  // only what the plugins ahead of this one registered.
  ctx.addAction("theme:ready", () => {
    ctx.registerSettingsGroup(SEO_SETTINGS_GROUP, {
      label: D.groupLabel,
      description: D.groupDescription,
      capability: SETTINGS_CAPABILITY,
      fields: [...SITE_WIDE_FIELDS, ...scopeFields(ctx)],
    });
    // Their own cards rather than more rows on the one above: an ownership
    // proof and a crawler policy are each answered once and rarely, where
    // everything in that card is answered while writing.
    ctx.registerSettingsGroup(SEO_VERIFICATION_GROUP, {
      label: D.verificationLabel,
      description: D.verificationDescription,
      capability: SETTINGS_CAPABILITY,
      fields: VERIFICATION_ENGINES.map((engine) => ({
        key: engine,
        type: "string",
        inputType: "text",
        label: VERIFICATION_LABELS[engine],
        maxLength: TOKEN_MAX,
      })),
    });
    ctx.registerSettingsGroup(SEO_ROBOTS_GROUP, {
      label: D.robotsLabel,
      description: D.robotsDescription,
      capability: SETTINGS_CAPABILITY,
      fields: [
        {
          key: "robots_txt",
          type: "string",
          inputType: "textarea",
          label: D.robotsField,
          maxLength: ROBOTS_MAX,
        },
      ],
    });
    ctx.registerSettingsPage(SEO_SETTINGS_GROUP, {
      label: D.pageLabel,
      description: D.pageDescription,
      groups: [SEO_SETTINGS_GROUP, SEO_VERIFICATION_GROUP, SEO_ROBOTS_GROUP],
      priority: 20,
    });
  });
  // What the admin form loads. Without it the form would show the registered
  // defaults over a site's legacy answers, and saving would turn indexing back
  // on for a site that had turned it off.
  ctx.addFilter("rpc:settings.get:output", async (bag, context) => {
    if (context.group !== SEO_SETTINGS_GROUP) return bag;
    // The RPC always runs inside the request store, so the null branch is
    // unreachable in a served request — it exists because the accessor is
    // the only way a filter handler reaches the context.
    const request = tryGetContext();
    return request === null ? bag : withLegacyDefaults(bag, request);
  });
}

async function withLegacyDefaults(
  bag: SettingsBag,
  ctx: AppContext,
): Promise<SettingsBag> {
  // Presence off what storage holds, value off the head's own read — so a site
  // that answered nothing is seeded nothing, and one that did is handed a
  // boolean and a string whatever the untyped row holds. The bag cannot answer
  // presence: `settings.get` fills a registered default into it, which reads
  // as an answer the site never gave and would suppress the seed.
  const groups = await loadSettingsGroups(ctx, [SEO_SETTINGS_GROUP, "site"]);
  const stored = groups[SEO_SETTINGS_GROUP] ?? {};
  const legacy = groups.site ?? {};
  const resolved = readSeoSettings(stored, legacy);
  const seeded: Record<string, JsonValue> = { ...bag };
  if (!("indexable" in stored) && LEGACY_KEYS.indexable in legacy) {
    seeded.indexable = resolved.indexable;
  }
  if (!("default_og_image" in stored) && resolved.defaultOgImage !== null) {
    seeded.default_og_image = resolved.defaultOgImage;
  }
  return seeded;
}

/**
 * This plugin's settings. Both groups come off one batched read — core
 * memoizes each per request, so a render pays a single query however many
 * tags ask.
 */
export async function loadSeoSettings(ctx: AppContext): Promise<SeoSettings> {
  const groups = await loadSettingsGroups(ctx, [SEO_SETTINGS_GROUP, "site"]);
  return readSeoSettings(groups[SEO_SETTINGS_GROUP] ?? {}, groups.site ?? {});
}

/** What one engine was handed to prove ownership. */
export interface VerificationTag {
  readonly name: string;
  readonly content: string;
}

/**
 * The ownership proofs the head carries, one per engine the owner configured.
 * Its own read rather than a field on {@link SeoSettings}: nothing but the head
 * asks, and the chain has no use for it.
 */
export async function loadVerificationTags(
  ctx: AppContext,
): Promise<readonly VerificationTag[]> {
  const groups = await loadSettingsGroups(ctx, [SEO_VERIFICATION_GROUP]);
  const bag = groups[SEO_VERIFICATION_GROUP] ?? {};
  return VERIFICATION_ENGINES.flatMap((engine) => {
    const content = nonEmpty(bag[engine]);
    return content === null
      ? []
      : [{ name: VERIFICATION_TAGS[engine], content }];
  });
}

/** A hand-written `/robots.txt`, replacing the generated one, or null. */
export async function loadRobotsBody(ctx: AppContext): Promise<string | null> {
  const groups = await loadSettingsGroups(ctx, [SEO_ROBOTS_GROUP]);
  return nonEmpty(groups[SEO_ROBOTS_GROUP]?.robots_txt);
}

/** A value coerced to a non-empty string, or null. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Undefined rather than a default, so an unset key falls through to the next
// source instead of answering for it.
function boolish(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
