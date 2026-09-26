// Admin-facing manifest wire shape — the half of the plugin manifest the
// precompiled admin and admin-editor read: the `PlumixManifest` payload and
// its `*ManifestEntry` types, the core nav-group roster, the `<script>` id the
// payload travels under, and the pure helpers the admin shares with the build
// (`emptyManifest`, `byPriorityThen`, `seedFromMetaBoxes`). Kept free of
// registry projection and HTML handling so neither ships to the admin.
// Re-exported unchanged from the public `@plumix/core/manifest` barrel.

import type {
  BlockNode,
  BlockVariation,
  PatternPreview,
  PatternTarget,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";
import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";

import type { Label } from "../i18n/label.js";
import type { ResolvedLocale } from "../i18n/locale-registry.js";
import type { NamedTemplateChoice } from "../route/render/template-builders.js";
import type { ResolvedMeta } from "../rpc/meta/core.js";
import type { MetaBoxFieldManifestEntry } from "./fields/manifest-entry.js";
import type {
  EntryMenuIcon,
  EntryTypeLabels,
  PluginComponentRef,
  TaxonomyMenuIcon,
  TermTaxonomyLabels,
} from "./registry.js";

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
 * Built-in nav-icon names that core nav items reference. The admin maps
 * each value to a lucide component at render time — keeps the wire
 * payload free of package identifiers and makes the union exhaustive at
 * the type level.
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
 * Built-in nav groups core ships. Plugins target their items at these
 * ids via `nav.group`, and can interleave their own groups by picking
 * priorities between or around these defaults. Labels are
 * `MessageDescriptor`s so the sidebar localizes at render time via
 * the admin's `useLabel` hook.
 *
 * Convention: plugin-declared groups keep their label descriptor id
 * under the same `core.adminNav.<groupId>` namespace (see
 * `@plumix/plugin-menu` → `appearance`, `@plumix/plugin-media` →
 * `library`, `@plumix/plugin-audit-log` → `tools`). The id space is
 * the concept, not the owner — translators see one "Appearance"
 * entry rather than one per plugin sharing the group.
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
 * Shape serialised into the admin's `<script id="plumix-manifest">` payload.
 * Intentionally a strict subset of `RegisteredEntryType`: drops
 * `registeredBy` (plugin attribution is server-only debug metadata) and
 * `rewrite` (URL mapping is evaluated server-side). Add fields only when the
 * admin UI needs them.
 *
 * `adminSlug` is derived at build time (see `buildManifest`) and is what the
 * admin router uses for `/entries/$slug`. Keeping it in the manifest rather
 * than re-deriving client-side lets the collision check run once on the
 * server and ships the final routing key as authoritative.
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
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly hasArchive?: boolean | string;
  /** The namespace the type's `entry:<capabilityType>:*` capabilities live under. */
  readonly capabilityType: string;
  readonly priority?: number;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /**
   * Per-type versioning policy. Populated when the entry type opts
   * into `supports: ['revisions']`. `maxRevisions` caps how many
   * revision rows are retained per live entry — oldest pruned past
   * the cap on each successful update. `autosaveIntervalSeconds`
   * shapes the editor's autosave cadence in a later slice; defaults
   * to 60 here so themes can read it without nil-checking.
   */
  readonly versioning?: {
    readonly maxRevisions: number;
    readonly autosaveIntervalSeconds: number;
  };
  /**
   * Theme-registered `named` templates selectable for this entry type,
   * surfaced to the editor's template picker. Sourced from the theme's
   * `templates` rules (not the plugin registry) and threaded in via
   * `buildManifest` options — the precompiled admin can't import the theme.
   * Omitted when the theme registers none for this type.
   */
  readonly namedTemplates?: readonly NamedTemplateChoice[];
  /**
   * Editor-selectable per-entry access policies for this type — the `key` +
   * `label` of each {@link SelectableAccessPolicy} in `access.policies`, with
   * the resolver stripped. Feeds the editor's visibility picker. Omitted when
   * the type declares no selectable policies (the default is the only option).
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
 * Shared base for every "card of fields" serialised entry. Each
 * concrete projection extends with its identifier + any surface-
 * specific layout + scope fields.
 */
/**
 * Entry-box wire field — drops `span` from the shared
 * `MetaBoxFieldManifestEntry`. The editor rail can't honor the hint
 * (see `EntryMetaBoxOptions`), so shipping it would just bloat the wire.
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
   * @deprecated Ignored by the admin editor — all entry meta boxes
   * render in the document rail as collapsible sections. Kept on the
   * wire so older plugins that set it don't fail manifest validation.
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
 * Shape serialised for termTaxonomies in the manifest. Strict allowlist
 * projection of `RegisteredTermTaxonomy` — drops `registeredBy` (server-only
 * debug metadata) and server-only operational flags (`isInQuickEdit`,
 * `hasAdminColumn`, `rewrite`) that don't affect the admin UI today.
 * `entryTypes` is kept so future admin surfaces (term-picker on post
 * editor) can filter by post type without a second round-trip.
 */
export interface TermTaxonomyManifestEntry {
  readonly name: string;
  readonly label: Label;
  /** Plugin-author-declared per-type labels — see
   *  `EntryTypeManifestEntry.labels` for the cascade contract. */
  readonly labels?: TermTaxonomyLabels;
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
}

/**
 * Shape serialised for settings groups in the manifest. Same shared
 * shape as every other meta surface; the storage key `name` replaces
 * the meta-box `id`. Fields use the same `MetaBoxFieldManifestEntry`
 * type — one field contract for plugin authors.
 */
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
 * One row in the assembled admin sidebar tree. Sources contributing
 * items: core (Dashboard, Users, Settings), entry types (auto-projected
 * to the `content` group), term taxonomies (auto-projected to the
 * `term-taxonomies` group), and plugin-registered admin pages with
 * `nav` set.
 *
 * Exactly one of `icon` (plugin-supplied React component ref) or
 * `coreIcon` (built-in lucide name) is set per item; admin picks a
 * generic fallback when neither is provided.
 *
 * `component` is set only for plugin-rendered routes — the admin's
 * `/p/$` catch-all looks up this ref to render the page. Items that
 * point at core admin routes (`/`, `/users`, `/settings`,
 * `/entries/<slug>`, etc.) leave it undefined.
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
  /** Export name on the plugin's `adminEntry` module — see `MarkSpec.adminSchema`. */
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
 * Wire-shipped manifest payload. Every field is optional on the type
 * so test fixtures can declare just the slice they exercise; the
 * server's `buildManifest` always populates all of them and consumers
 * coerce missing fields to `[]` at the read site.
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
   * Per-plugin catalog URL maps for the i18n runtime registry (#697).
   * Admin fetches `pluginI18n[id].catalogs[locale]` at boot, merges the
   * loaded `messages` into the active Lingui instance. The source
   * locale never has an entry (Lingui returns `descriptor.message`
   * when active === source). Locales are intersected with the site's
   * enabled list before emission. Plugins without an `i18n` slot
   * don't appear here.
   */
  readonly pluginI18n?: PluginI18nManifest;
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
 * Strict manifest shape — every slice is populated. `buildManifest`
 * returns this; tests reading from it don't need `?.` everywhere. The
 * wider `PlumixManifest` (all-optional) is what flows over the wire
 * and what test fixtures construct.
 */
export type BuiltManifest = {
  readonly [K in keyof PlumixManifest]-?: NonNullable<PlumixManifest[K]>;
};

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

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
  };
}

/**
 * Shared comparator: `priority` ascending (unspecified sorts last),
 * ties broken by a caller-supplied stable key (id / name) in
 * alphabetical order. Used by `buildManifest` server-side AND the
 * admin's in-memory filter helpers so the shipped manifest and the
 * admin filter paths agree on order regardless of registration
 * sequence.
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
 * Seed per-field values from a server meta bag, falling back to each
 * field's registered `default`. Shared by every admin form that owns
 * meta state (entry editor, term edit route, user edit route, settings
 * group card) — one shape, one behaviour.
 */
export function seedFromMetaBoxes(
  boxes: readonly {
    readonly fields: readonly {
      readonly key: string;
      readonly default?: unknown;
    }[];
  }[],
  stored: ResolvedMeta | null | undefined,
): ResolvedMeta {
  const bag = stored ?? {};
  const seed: Record<string, unknown> = {};
  for (const box of boxes) {
    for (const field of box.fields) {
      seed[field.key] = bag[field.key] ?? field.default;
    }
  }
  return seed;
}
