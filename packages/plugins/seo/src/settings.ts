import type { JsonValue } from "plumix";
import type { Label } from "plumix/i18n";
import type { AppContext, PluginSetupContext } from "plumix/plugin";
import type { SettingsBag } from "plumix/schema";
import { loadSettingsGroups, loadSiteSettings } from "plumix";
import { tryGetContext } from "plumix/plugin";

/** This plugin's settings group — the storage unit and the admin card. */
export const SEO_SETTINGS_GROUP = "seo";

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
  pageLabel: { id: "plugin.seo.settings.page.label", message: "SEO" },
  pageDescription: {
    id: "plugin.seo.settings.page.description",
    message: "Site-wide search and social defaults.",
  },
} as const satisfies Record<string, Label>;

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

/** The site-wide answers the head needs. */
export interface SeoSettings {
  /** False holds the whole site out of the index. */
  readonly indexable: boolean;
  /** The last link of the `og:image` chain, or null. */
  readonly defaultOgImage: string | null;
  /** Who the structured-data graph names as the site's publisher. */
  readonly represents: SiteRepresents;
}

export function registerSeoSettings(ctx: PluginSetupContext): void {
  ctx.registerSettingsGroup(SEO_SETTINGS_GROUP, {
    label: D.groupLabel,
    description: D.groupDescription,
    fields: [
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
    ],
  });
  ctx.registerSettingsPage(SEO_SETTINGS_GROUP, {
    label: D.pageLabel,
    description: D.pageDescription,
    groups: [SEO_SETTINGS_GROUP],
    priority: 20,
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
  // Presence off the legacy bag, value off the head's own read — so a site
  // that answered nothing is seeded nothing, and one that did is handed a
  // boolean and a string whatever the untyped row holds.
  const [legacy, resolved] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
  ]);
  const seeded: Record<string, JsonValue> = { ...bag };
  if (!("indexable" in seeded) && LEGACY_KEYS.indexable in legacy) {
    seeded.indexable = resolved.indexable;
  }
  if (!("default_og_image" in seeded) && resolved.defaultOgImage !== null) {
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
  const own = groups[SEO_SETTINGS_GROUP] ?? {};
  const legacy = groups.site ?? {};
  return {
    indexable:
      boolish(own.indexable) ?? boolish(legacy[LEGACY_KEYS.indexable]) ?? true,
    defaultOgImage:
      nonEmpty(own.default_og_image) ??
      nonEmpty(legacy[LEGACY_KEYS.default_og_image]),
    represents:
      REPRESENTS.find((option) => option.value === own.represents)?.value ??
      REPRESENTS[0].value,
  };
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
