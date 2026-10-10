// Shipped to the admin bundle: keep registry projection and HTML handling out
// of this module.

import type {
  PostCapabilityAction,
  TermTaxonomyCapabilityAction,
} from "../access/contract/capability.js";
import type {
  BlockNode,
  BlockVariation,
  PatternPreview,
  PatternTarget,
  ThemeBreakpoints,
  ThemeTokens,
} from "../blocks/index.js";
import type { PlumixConfig } from "../config.js";
import type { AdminArea } from "../context/runtime-adapter.js";
import type { Label } from "../i18n/label.js";
import type { ResolvedLocale } from "../i18n/locale-registry.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import type { FrameworkRoutes } from "../route/contract/framework-routes.js";
import type { NamedTemplateChoice } from "../route/contract/named-template.js";
import type { MetaBoxFieldManifestEntry } from "./fields/manifest-entry.js";
import type {
  EntryMenuIcon,
  EntryTypeLabels,
  PluginComponentRef,
  TaxonomyMenuIcon,
  TermTaxonomyLabels,
} from "./registry.js";
import {
  spellEntryCapability,
  spellTermCapability,
} from "../access/contract/capability.js";
import { DEFAULT_BREAKPOINTS } from "../blocks/index.js";

export { startingMeta } from "./fields/starting-meta.js";
export type { StartingMetaField } from "./fields/starting-meta.js";

// Wire shape intentionally equals DashboardWidgetOptions (minus
// registeredBy) — unlike e.g. FieldTypeManifestEntry, a widget's options
// carry nothing server-only to drop, so the manifest entry just mirrors
// them as the admin-facing boundary.
export interface DashboardWidgetManifestEntry {
  readonly id: string;
  readonly title: Label;
  readonly capability?: string;
  readonly component: PluginComponentRef;
  readonly priority?: number;
}

/**
 * The admin maps each name to a lucide icon, keeping package identifiers off
 * the wire.
 */
export type CoreIconName =
  | EntryMenuIcon
  | TaxonomyMenuIcon
  | "dashboard"
  | "users"
  | "settings"
  | "puzzle"
  | "mail"
  | "key";

/**
 * Plugin-declared groups put their label id under `core.adminNav.<groupId>`
 * too, so translators see one entry per group, not per plugin.
 */
export const CORE_NAV_GROUPS: readonly {
  readonly id: string;
  readonly label: Label;
  readonly priority: number;
}[] = [
  {
    id: "overview",
    label: { id: "core.adminNav.overview", message: "Overview" },
    priority: 0,
  },
  {
    id: "content",
    label: { id: "core.adminNav.content", message: "Entries" },
    priority: 100,
  },
  {
    id: "term-taxonomies",
    label: { id: "core.adminNav.termTaxonomies", message: "Taxonomies" },
    priority: 200,
  },
  {
    id: "management",
    label: { id: "core.adminNav.management", message: "Management" },
    priority: 1000,
  },
];

/**
 * Strict subset of `RegisteredEntryType`; add fields only when the admin needs
 * them. `adminSlug` ships precomputed so the collision check runs once, on the
 * server.
 */
export interface EntryTypeManifestEntry {
  readonly name: string;
  readonly adminSlug: string;
  readonly label: Label;
  /** Plugin-author-declared per-type labels. Admin consumers resolve
   *  the cascade via `entryTypeLabel(entry, key)` which falls back to
   *  `GENERIC_ENTRY_TYPE_LABELS[key]` when a key is unset — keeping
   *  the wire shape narrow (only author-declared keys serialize). */
  readonly labels?: EntryTypeLabels;
  readonly description?: Label;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly hasArchive?: boolean | string;
  /**
   * The namespace the type's `entry:<capabilityType>:*` capabilities live
   * under.
   */
  readonly capabilityType: string;
  readonly priority?: number;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /**
   * Set only when the type supports `revisions`. `maxRevisions` caps retained
   * revisions per entry, pruning the oldest on each update.
   */
  readonly versioning?: {
    readonly maxRevisions: number;
    readonly autosaveIntervalSeconds: number;
  };
  /**
   * From the theme's `templates` rules, passed via `buildManifest` options
   * because the precompiled admin can't import the theme. Omitted when none
   * target this type.
   */
  readonly namedTemplates?: readonly NamedTemplateChoice[];
  /**
   * `access.policies` without resolvers. Omitted when the type declares none.
   */
  readonly accessPolicies?: readonly AccessPolicyChoice[];
}

/**
 * Client-safe projection of a {@link SelectableAccessPolicy} — `key` + `label`,
 * never the resolver. Surfaced to the editor's visibility picker via
 * {@link EntryTypeManifestEntry.accessPolicies}.
 */
export interface AccessPolicyChoice {
  readonly key: string;
  readonly label: Label;
}

/**
 * Omits `span`: the editor rail renders every field full width.
 */
export type EntryMetaBoxFieldManifestEntry = Omit<
  MetaBoxFieldManifestEntry,
  "span"
>;

export interface MetaBoxBaseManifestEntry {
  readonly label: Label;
  readonly description?: Label;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

export interface EntryMetaBoxManifestEntry extends Omit<
  MetaBoxBaseManifestEntry,
  "fields"
> {
  readonly id: string;
  /**
   * @deprecated Ignored by the admin editor; kept so plugins that set it still validate.
   */
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
  readonly fields: readonly EntryMetaBoxFieldManifestEntry[];
}

export interface TermMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
  readonly termTaxonomies: readonly string[];
}

export interface UserMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
}

/**
 * Strict allowlist of `RegisteredTermTaxonomy`; server-only fields stay off the
 * wire.
 */
export interface TermTaxonomyManifestEntry {
  readonly name: string;
  readonly label: Label;
  /** Plugin-author-declared per-type labels — see
   *  `EntryTypeManifestEntry.labels` for the cascade contract. */
  readonly labels?: TermTaxonomyLabels;
  readonly description?: Label;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
}

export interface SettingsGroupManifestEntry extends MetaBoxBaseManifestEntry {
  readonly name: string;
}

/**
 * Shape serialised for settings pages in the manifest. Pages are pure
 * admin-UI composition: `groups` names registered groups in render
 * order, one shadcn `<Card>` per group in the admin route.
 */
export interface SettingsPageManifestEntry {
  readonly name: string;
  readonly label: Label;
  readonly description?: Label;
  readonly groups: readonly string[];
  readonly priority?: number;
}

/**
 * At most one of `icon` and `coreIcon` is set. `component` is set only for
 * plugin pages, which the admin's `/p/$` catch-all renders.
 */
export interface AdminNavItem {
  readonly to: string;
  readonly label: Label;
  readonly order?: number;
  readonly capability?: string;
  readonly icon?: PluginComponentRef;
  readonly coreIcon?: CoreIconName;
  readonly component?: PluginComponentRef;
  readonly exact?: boolean;
  /** Synonyms the command palette matches in addition to `label`. */
  readonly keywords?: readonly Label[];
}

export interface AdminNavGroup {
  readonly id: string;
  readonly label: Label;
  readonly priority?: number;
  readonly icon?: PluginComponentRef;
  readonly coreIcon?: CoreIconName;
  readonly items: readonly AdminNavItem[];
}

export interface FieldTypeManifestEntry {
  readonly type: string;
  readonly component: PluginComponentRef;
}

export interface BlockManifestEntry {
  readonly name: string;
  readonly title: Label;
  readonly category?: string;
  readonly icon?: string;
  readonly description?: Label;
  readonly keywords?: readonly Label[];
  readonly inserter?: boolean;
  readonly variations?: readonly BlockVariation[];
}

export interface MarkManifestEntry {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly keyboardShortcut?: string;
  readonly bubbleMenuLabel?: string;
  readonly bubbleMenuIcon?: string;
  /**
   * Export name on the plugin's `adminEntry` module — see
   * `MarkSpec.adminSchema`.
   */
  readonly adminSchema?: string;
}

export interface PatternManifestEntry {
  readonly name: string;
  readonly title: Label;
  readonly category?: string;
  readonly keywords?: readonly Label[];
  readonly preview?: PatternPreview;
  readonly target?: PatternTarget;
  readonly entryTypes?: readonly string[];
  readonly priority?: number;
  readonly content: readonly BlockNode[];
}

/**
 * All optional so fixtures can declare one slice; `buildManifest` fills every
 * field, and readers default missing ones to `[]`.
 */
export interface PlumixManifest {
  readonly entryTypes?: readonly EntryTypeManifestEntry[];
  readonly termTaxonomies?: readonly TermTaxonomyManifestEntry[];
  readonly entryMetaBoxes?: readonly EntryMetaBoxManifestEntry[];
  readonly termMetaBoxes?: readonly TermMetaBoxManifestEntry[];
  readonly userMetaBoxes?: readonly UserMetaBoxManifestEntry[];
  readonly settingsGroups?: readonly SettingsGroupManifestEntry[];
  readonly settingsPages?: readonly SettingsPageManifestEntry[];
  readonly adminNav?: readonly AdminNavGroup[];
  readonly dashboardWidgets?: readonly DashboardWidgetManifestEntry[];
  readonly fieldTypes?: readonly FieldTypeManifestEntry[];
  readonly blocks?: readonly BlockManifestEntry[];
  readonly marks?: readonly MarkManifestEntry[];
  readonly patterns?: readonly PatternManifestEntry[];
  /**
   * Theme tokens from `defineTheme({ tokens })`. Routed through the
   * manifest channel because the precompiled admin shell can't import
   * `plumix.config.ts` at build time.
   */
  readonly tokens?: ThemeTokens;
  /**
   * Theme responsive breakpoints from `defineTheme({ breakpoints })`. Same
   * manifest-channel reason as `tokens`: the precompiled admin shell can't
   * import the user's config, but the editor needs them for device widths.
   */
  readonly breakpoints?: ThemeBreakpoints;
  /**
   * Site i18n config — populates the locale-switcher dropdown and gives
   * admin components access to the active default. Same channel reason as
   * `tokens`: the precompiled admin shell can't import the user's config.
   */
  readonly i18n?: I18nManifest;
  /**
   * Admin fetches `pluginI18n[id].catalogs[locale]` at boot. Locales are
   * limited to the site's enabled ones; the source locale never appears, as
   * Lingui falls back to `descriptor.message`.
   */
  readonly pluginI18n?: PluginI18nManifest;
  /**
   * Fixed at build time, so it rides the manifest: the admin hides a
   * slot-backed surface the deployment can't serve.
   */
  readonly configuredSlots?: ConfiguredSlots;
  /**
   * The admin areas the deployment's runtime refuses, whoever is signed in.
   * Fixed at build time like `configuredSlots`: the admin hides every surface
   * of a refused area (ADR 0014).
   */
  readonly refusedAdminAreas?: readonly AdminArea[];
  /**
   * Whether the site keeps core's author routes, so the user screen names the
   * `/authors/` URL only where one exists. The other families are left out:
   * no admin surface reads them.
   */
  readonly frameworkRoutes?: Pick<FrameworkRoutes, "author">;
}

// Constrains each slot name to a key of the config it is read off.
type ConfigKey<K extends keyof PlumixConfig> = K;

/**
 * The `plumix()` config keys that hold an infrastructure adapter. A new
 * `plumix()` key that holds an adapter the admin could offer an action for
 * joins this union.
 */
export type InfrastructureSlot = ConfigKey<
  "storage" | "imageDelivery" | "kv" | "cdn" | "mailer"
>;

/** Per infrastructure slot, whether the resolved config sets it — nothing about
 *  the adapter behind it crosses to the admin. */
export type ConfiguredSlots = Readonly<Record<InfrastructureSlot, boolean>>;

/** Which infrastructure slots `config` fills. */
export function configuredSlotsOf(
  config: Pick<PlumixConfig, InfrastructureSlot>,
): ConfiguredSlots {
  return {
    storage: config.storage !== undefined,
    imageDelivery: config.imageDelivery !== undefined,
    kv: config.kv !== undefined,
    cdn: config.cdn !== undefined,
    mailer: config.mailer !== undefined,
  } satisfies Record<InfrastructureSlot, boolean>;
}

/** Per-plugin catalog URL maps. Flat record keyed by plugin id so
 *  `manifest.pluginI18n[id]` is direct lookup; admin reads this
 *  shape verbatim. */
export type PluginI18nManifest = Readonly<
  Record<string, { readonly catalogs: Readonly<Record<string, string>> }>
>;

export interface I18nManifest {
  readonly defaultLocale: string;
  readonly locales: readonly ResolvedLocale[];
}

/**
 * What `buildManifest` returns: every slice populated. The all-optional
 * `PlumixManifest` is the wire and fixture shape.
 */
export type BuiltManifest = {
  readonly [K in keyof PlumixManifest]-?: NonNullable<PlumixManifest[K]>;
};

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

/**
 * The capability the admin compares for an entry type's action — spelled from
 * the manifest entry's resolved namespace, so a pooled type is gated where its
 * grants live.
 */
export function entryTypeCapability(
  entryType: Pick<EntryTypeManifestEntry, "capabilityType">,
  action: PostCapabilityAction,
): string {
  return spellEntryCapability(entryType.capabilityType, action);
}

/** The capability the admin compares for a taxonomy's action. */
export function termTaxonomyCapability(
  taxonomy: Pick<TermTaxonomyManifestEntry, "name">,
  action: TermTaxonomyCapabilityAction,
): string {
  return spellTermCapability(taxonomy.name, action);
}

export function emptyManifest(): PlumixManifest {
  return {
    entryTypes: [],
    termTaxonomies: [],
    entryMetaBoxes: [],
    termMetaBoxes: [],
    userMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
    adminNav: [],
    dashboardWidgets: [],
    fieldTypes: [],
    blocks: [],
    marks: [],
    patterns: [],
    tokens: {},
    breakpoints: DEFAULT_BREAKPOINTS,
    i18n: { defaultLocale: "en", locales: [] },
    pluginI18n: {},
    configuredSlots: configuredSlotsOf({}),
    refusedAdminAreas: [],
    frameworkRoutes: { author: true },
  };
}

/**
 * Unset `priority` sorts last; ties break alphabetically by `getKey`. The
 * server build and admin filters share it so their orders agree.
 */
export function byPriorityThen<T extends { readonly priority?: number }>(
  getKey: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return getKey(a).localeCompare(getKey(b));
  };
}

/**
 * Seeds each registered key with its stored value; a key storage lacks gets
 * nothing, whatever the field's `.default()`.
 */
export function seedFromMetaBoxes(
  boxes: readonly {
    readonly fields: readonly { readonly key: string }[];
  }[],
  stored: ResolvedMeta | null | undefined,
): ResolvedMeta {
  const bag = stored ?? {};
  const seed: Record<string, unknown> = {};
  for (const box of boxes) {
    for (const field of box.fields) {
      seed[field.key] = bag[field.key];
    }
  }
  return seed;
}
