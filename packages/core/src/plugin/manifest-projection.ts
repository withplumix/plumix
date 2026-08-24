// Build-time manifest projection — the build half of the plugin system. Reads a
// `PluginRegistry` snapshot and projects it into the wire `PlumixManifest` the
// admin bundle consumes: the manifest entry types, `buildManifest`, the
// `to*Entry` projectors, the registration-time assertions, admin-slug
// derivation, admin-nav assembly, and the HTML `<script>` transport. Its sole
// build-time caller is the plumix Vite plugin. Re-exported unchanged from the
// public `@plumix/core/manifest` barrel.

import type {
  BlockNode,
  BlockSpec,
  BlockVariation,
  PatternInsertMode,
  PatternPreview,
  PatternTarget,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";
import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";

import type { Label } from "../i18n/label.js";
import type { ResolvedI18n, ResolvedLocale } from "../i18n/locale-registry.js";
import type { NamedTemplateChoice } from "../route/render/template-builders.js";
import type { ResolvedMeta } from "../rpc/meta/core.js";
import type { PluginI18nSlot } from "./define.js";
import type { MetaFieldCondition } from "./fields/condition.js";
import type {
  MetaBoxField,
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  MetaScalarType,
  ReferenceTarget,
  RepeaterDialogSize,
  RepeaterLayout,
  SelectAppearance,
} from "./fields/meta-box-field.js";
import type {
  AdminNavGroupRef,
  EntryTypeAccess,
  EntryTypeLabels,
  PluginComponentRef,
  PluginRegistry,
  RegisteredBlock,
  RegisteredDashboardWidget,
  RegisteredEntryMetaBox,
  RegisteredEntryType,
  RegisteredFieldType,
  RegisteredMark,
  RegisteredPattern,
  RegisteredSettingsGroup,
  RegisteredSettingsPage,
  RegisteredTermMetaBox,
  RegisteredTermTaxonomy,
  RegisteredUserMetaBox,
  TermTaxonomyLabels,
} from "./registry.js";
import { labelSourceText } from "../i18n/label.js";
import { DuplicateAdminSlugError, PluginDefinitionError } from "./errors.js";
import {
  resolveEntryTypeVisibility,
  resolveTermTaxonomyVisibility,
} from "./registry.js";

export function manifestEntryVisibility(
  entry:
    | Pick<EntryTypeManifestEntry, "isPublic" | "showUI" | "showInSidebar">
    | Pick<TermTaxonomyManifestEntry, "isPublic" | "showUI" | "showInSidebar">,
): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
} {
  const isPublic = entry.isPublic ?? true;
  const showUI = entry.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: entry.showInSidebar ?? showUI,
  };
}

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
  | "dashboard"
  | "content"
  | "file-text"
  | "layout"
  | "image"
  | "calendar"
  | "tag"
  | "folder"
  | "users"
  | "settings"
  | "puzzle"
  | "mail"
  | "key";

// Subset of `CoreIconName` plugins may emit on `EntryTypeOptions.menuIcon`
// or `TermTaxonomyOptions.menuIcon`. Names outside this set fall back to
// a sensible default at projection time.
const ENTRY_MENU_ICONS: ReadonlySet<CoreIconName> = new Set<CoreIconName>([
  "content",
  "file-text",
  "layout",
  "image",
  "calendar",
]);
const TAXONOMY_MENU_ICONS: ReadonlySet<CoreIconName> = new Set<CoreIconName>([
  "tag",
  "folder",
]);

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
  /**
   * Resolved visibility. `buildManifest` always emits these — consumers
   * should read them via `manifestEntryVisibility(entry)` which applies
   * the same cascade rules as `resolveEntryTypeVisibility` when they
   * happen to be missing (lets admin test fixtures stay terse without
   * the client ever branching on undefined).
   */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly hasArchive?: boolean | string;
  readonly capabilityType?: string;
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
 * Client-safe field descriptor inside a meta box. Mirrors `MetaBoxField`
 * minus the server-only `sanitize` callback and `default` value (the
 * admin receives the default server-side and injects it into the form).
 */
export interface MetaBoxFieldManifestEntry {
  readonly key: string;
  readonly label: Label;
  readonly type: MetaScalarType;
  readonly inputType: string;
  readonly description?: Label;
  readonly required?: boolean;
  /** Static input adornments — see `MetaBoxFieldBase.prepend` / `.append`. */
  readonly prepend?: Label;
  readonly append?: Label;
  readonly placeholder?: Label;
  readonly maxLength?: number;
  /**
   * Lower bound. `number` carries it as a number; `date` / `datetime`
   * / `time` carry it as the matching ISO string. Renderers branch on
   * `inputType` to pick the right interpretation.
   */
  readonly min?: number | string;
  /** Upper bound — see `min`. */
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  /** Choice-field cardinality — `select` fields store an array when set. */
  readonly multiple?: boolean;
  /** Choice-field control variant — see `SelectAppearance`. */
  readonly appearance?: SelectAppearance;
  /** Toggle switch state labels — see `ToggleMetaBoxField`. */
  readonly onText?: Label;
  readonly offText?: Label;
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  /**
   * Carried for reference field variants (`user`, `entry`, `term`,
   * `media`, plugin-registered kinds). The admin's generic picker
   * dispatches on `referenceTarget.kind` to call the matching
   * lookup RPC; `scope` rides along untouched.
   */
  readonly referenceTarget?: ReferenceTarget;
  /**
   * Richtext field allowlists — wire projection of
   * `RichtextMetaBoxField`'s `marks` / `nodes` / `blocks`. See that
   * type for semantics.
   */
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  /**
   * Child-field manifest for the composite field types — repeater row
   * schema and group members alike, keyed positionally, same shape as a
   * top-level field. Children keep their `span`: the row-editor dialog and
   * group grid lay them out on a 12-column grid that honours it. Sanitize
   * callbacks are stripped from the wire shape; the admin recurses through
   * this list when rendering each row / group. The renderer dispatches on
   * `inputType` (`repeater` vs `group`) to interpret it.
   */
  readonly subFields?: readonly MetaBoxFieldManifestEntry[];
  /** Repeater add-row button label — see {@link RepeaterMetaBoxField.addLabel}. */
  readonly addLabel?: Label;
  /** Repeater row layout — see {@link RepeaterLayout}. */
  readonly layout?: RepeaterLayout;
  /** Repeater collapsed-row summary sub-field key — see {@link RepeaterMetaBoxField.collapsed}. */
  readonly collapsed?: string;
  /** Repeater row-editor dialog width — see {@link RepeaterDialogSize}. */
  readonly dialogSize?: RepeaterDialogSize;
  /**
   * Capability gate for the individual field. See `MetaBoxFieldBase.capability`.
   */
  readonly capability?: string;
  /**
   * Conditional visibility rules. See `MetaBoxFieldBase.visibleWhen`.
   */
  readonly visibleWhen?: MetaFieldCondition;
}

/**
 * Shared base for every "card of fields" serialised entry. Each
 * concrete projection extends with its identifier + any surface-
 * specific layout + scope fields.
 */
export interface MetaBoxBaseManifestEntry {
  readonly label: Label;
  readonly description?: Label;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Entry-box wire field — drops `span` from the shared
 * `MetaBoxFieldManifestEntry`. The editor rail can't honor the hint
 * (see `EntryMetaBoxOptions`), so shipping it would just bloat the wire.
 */
export type EntryMetaBoxFieldManifestEntry = Omit<
  MetaBoxFieldManifestEntry,
  "span"
>;

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
  /** Resolved visibility — see `EntryTypeManifestEntry`. */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
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
  // `buildManifest` always populates this with the spec's value or
  // `"copy"`; consumers that read raw manifest fixtures may still see
  // `undefined`.
  readonly insert?: PatternInsertMode;
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

/** URL the admin runtime fetches to load a plugin's compiled catalog
 *  for a given locale. Same-origin under `/_plumix/admin/...` so the
 *  default CSP `script-src 'self'` covers the dynamic import. Widening
 *  to absolute URLs (CDN-hosted catalogs) would need a CSP review.
 *
 *  Paired with `pluginCatalogStagedPath` — the plumix Vite plugin stages
 *  each plugin's `.mjs` at that filesystem path so the URL resolves. */
export function pluginCatalogUrl(pluginId: string, locale: string): string {
  return `/_plumix/admin/${pluginCatalogStagedPath(pluginId, locale)}`;
}

/** Filesystem path (relative to the admin asset root) where the plumix
 *  Vite plugin must stage `<plugin.i18n.catalogPath>/<locale>.mjs`.
 *  Mirrors `pluginCatalogUrl` so a single edit retargets both ends of
 *  the runtime fetch. */
export function pluginCatalogStagedPath(
  pluginId: string,
  locale: string,
): string {
  return `plugins/${pluginId}/locales/${locale}.mjs`;
}

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
    i18n: { defaultLocale: "en", locales: [] },
    pluginI18n: {},
  };
}

/**
 * The single source of contributed (non-core) block specs: plugin blocks
 * registered via `ctx.registerBlock` plus theme blocks from the `defineTheme`
 * `blocks` field, at precedence plugin < theme (the theme, being the most
 * site-specific layer, wins a name clash). Both the per-app block registry
 * (`buildApp`) and the admin manifest read from here, so the two never diverge.
 */
export function collectContributedBlocks(
  registeredBlocks: Iterable<RegisteredBlock>,
  themeBlocks: readonly BlockSpec[] = [],
): readonly BlockSpec[] {
  // Deduped by name, theme last so it wins a clash — matching the last-write-
  // wins the runtime registry gives it, so `buildManifest` and `buildApp` agree.
  const byName = new Map<string, BlockSpec>();
  for (const { spec } of registeredBlocks) byName.set(spec.name, spec);
  for (const spec of themeBlocks) byName.set(spec.name, spec);
  return [...byName.values()];
}

/**
 * Project a registry snapshot into its manifest form — the subset that ships
 * to the admin bundle. Every surface with a `priority?: number` field —
 * entry types, entry/term/user meta boxes, settings pages, settings groups —
 * is sorted by `priority` ascending; ties break by `name` / `id`
 * alphabetical so the shipped order is deterministic regardless of
 * plugin install order.
 *
 * Throws `DuplicateAdminSlugError` if two post types resolve to the same
 * admin slug — the admin router can't disambiguate `/entries/$slug` in that
 * case, and catching it at build time is cheaper than a 404 at runtime.
 */
export function buildManifest(
  registry: PluginRegistry,
  options?: {
    readonly tokens?: ThemeTokens;
    readonly breakpoints?: ThemeBreakpoints;
    /**
     * Theme `named` templates grouped by entry-type name (see
     * `collectNamedTemplates`). Routed through options — like `tokens` —
     * because the theme's template rules aren't in the plugin registry.
     */
    readonly namedTemplates?: Readonly<
      Record<string, readonly NamedTemplateChoice[]>
    >;
    /**
     * Theme-contributed block specs (the `defineTheme` `blocks` field). Routed
     * through options — like `namedTemplates` — because they live on the theme
     * descriptor, not the plugin registry. Merged with plugin blocks by
     * {@link collectContributedBlocks} so the manifest lists both.
     */
    readonly blocks?: readonly BlockSpec[];
    readonly i18n?: ResolvedI18n;
    readonly plugins?: readonly {
      readonly id: string;
      readonly i18n?: PluginI18nSlot;
    }[];
    /** Plugin ids whose catalogs admin already bakes into its bundle
     *  via `import.meta.glob("../../../plugins/*"/locales/*.mjs")` —
     *  emitting URLs for them double-loads at runtime. The plumix
     *  vite plugin computes this set by inspecting which plugins
     *  resolve through the `@plumix/plugin-<id>` convention against
     *  the consumer's `node_modules`. Empty / omitted means every
     *  i18n-slot plugin gets a URL. Only consulted alongside
     *  `plugins`; passing this set without `plugins` is a no-op. */
    readonly adminBundledPluginIds?: ReadonlySet<string>;
  },
): BuiltManifest {
  const entries = Array.from(registry.entryTypes.values())
    .map((pt) => toEntryTypeManifest(pt, options?.namedTemplates?.[pt.name]))
    .sort(byPriorityThen((e) => e.name));
  assertUniqueAdminSlugs(entries);
  const termTaxonomies = Array.from(registry.termTaxonomies.values()).map(
    toTermTaxonomyEntry,
  );
  const entryMetaBoxes = Array.from(registry.entryMetaBoxes.values())
    .map(toEntryMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const termMetaBoxes = Array.from(registry.termMetaBoxes.values())
    .map(toTermMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const userMetaBoxes = Array.from(registry.userMetaBoxes.values())
    .map(toUserMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  assertMetaBoxScopesExist(
    entryMetaBoxes,
    (box) => box.entryTypes,
    new Set(entries.map((e) => e.name)),
    "entry meta box",
    "entry type",
  );
  assertMetaBoxScopesExist(
    termMetaBoxes,
    (box) => box.termTaxonomies,
    new Set(termTaxonomies.map((t) => t.name)),
    "term meta box",
    "termTaxonomy",
  );
  assertUniqueFieldKeysPerScope(
    entryMetaBoxes,
    (box) => box.entryTypes,
    "entry",
  );
  assertUniqueFieldKeysPerScope(
    termMetaBoxes,
    (box) => box.termTaxonomies,
    "term",
  );
  // User meta is a flat keyspace — one synthetic "user" scope keeps
  // the shared helper honest without inventing a second code path.
  assertUniqueFieldKeysPerScope(userMetaBoxes, getUserScope, "user");
  assertSingleFeaturedPerEntryType(registry);
  const settingsGroups = Array.from(registry.settingsGroups.values())
    .map(toSettingsGroupEntry)
    .sort(byPriorityThen((g) => g.name));
  const settingsPages = Array.from(registry.settingsPages.values())
    .map(toSettingsPageEntry)
    .sort(byPriorityThen((p) => p.name));
  assertSettingsPageGroupsExist(settingsPages, registry.settingsGroups);
  const adminNav = projectAdminNav(registry, entries, termTaxonomies);
  const dashboardWidgets = Array.from(registry.dashboardWidgets.values())
    .map(toDashboardWidgetEntry)
    .sort(byPriorityThen((w) => w.id));
  const fieldTypes = Array.from(registry.fieldTypes.values())
    .map(toFieldTypeEntry)
    .sort((a, b) => a.type.localeCompare(b.type));
  const blocks = collectContributedBlocks(
    registry.blockSpecs.values(),
    options?.blocks,
  )
    .map(toBlockEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  const marks = Array.from(registry.markSpecs.values())
    .map(toMarkEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  const patterns = Array.from(registry.patternSpecs.values())
    .map(toPatternEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    entryTypes: entries,
    termTaxonomies,
    entryMetaBoxes,
    termMetaBoxes,
    userMetaBoxes,
    settingsGroups,
    settingsPages,
    adminNav,
    dashboardWidgets,
    fieldTypes,
    blocks,
    marks,
    patterns,
    tokens: options?.tokens ?? {},
    breakpoints: options?.breakpoints ?? DEFAULT_BREAKPOINTS,
    i18n: {
      defaultLocale: options?.i18n?.defaultLocale.code ?? "en",
      // Wire-filtered to enabled entries — the admin dropdown ships exactly
      // what's available, and a "disabled in catalog but visible in UI"
      // affordance can be re-introduced when there's a consumer.
      locales: (options?.i18n?.locales ?? []).filter((l) => l.enabled),
    },
    pluginI18n: projectPluginI18n(
      options?.plugins,
      options?.i18n,
      options?.adminBundledPluginIds,
    ),
  };
}

function projectPluginI18n(
  plugins:
    | readonly { readonly id: string; readonly i18n?: PluginI18nSlot }[]
    | undefined,
  siteI18n: ResolvedI18n | undefined,
  adminBundledPluginIds: ReadonlySet<string> | undefined,
): PluginI18nManifest {
  if (!plugins) return {};
  const siteLocales = new Set(
    (siteI18n?.locales ?? []).filter((l) => l.enabled).map((l) => l.code),
  );
  const out: Record<string, { catalogs: Record<string, string> }> = {};
  for (const plugin of plugins) {
    if (!plugin.i18n) continue;
    // Workspace plugins are baked into admin via `import.meta.glob` —
    // emitting URLs would mean admin double-loads at boot.
    if (adminBundledPluginIds?.has(plugin.id)) continue;
    const catalogs: Record<string, string> = {};
    for (const locale of plugin.i18n.locales) {
      if (locale === plugin.i18n.sourceLocale) continue;
      // Site-locale intersection: when the site declares i18n,
      // emit URLs only for locales it has enabled. With no site
      // i18n configured, trust the plugin's list so tests without
      // site config still exercise the URL shape.
      if (siteLocales.size > 0 && !siteLocales.has(locale)) continue;
      catalogs[locale] = pluginCatalogUrl(plugin.id, locale);
    }
    // Skip plugins whose entire locale set was intersected/dropped —
    // a manifest entry with empty catalogs is wire noise that admin's
    // boot loop would still iterate.
    if (Object.keys(catalogs).length > 0) out[plugin.id] = { catalogs };
  }
  return out;
}

interface MutableAdminNavGroup {
  id: string;
  label: Label;
  priority?: number;
  icon?: PluginComponentRef;
  coreIcon?: CoreIconName;
  items: AdminNavItem[];
}

// Built-in items core seeds into the projection. Each row is keyed by
// the group id it lands in; capability gating is admin-side at render
// time (the manifest projection ships every item, the sidebar drops
// what the user can't see).
const CORE_NAV_ITEMS: readonly { groupId: string; item: AdminNavItem }[] = [
  {
    groupId: "overview",
    item: {
      to: "/",
      label: { id: "core.adminNav.item.dashboard", message: "Dashboard" },
      coreIcon: "dashboard",
      order: 0,
      exact: true,
      keywords: [
        { id: "core.adminNav.keyword.home", message: "home" },
        { id: "core.adminNav.keyword.overview", message: "overview" },
      ],
    },
  },
  {
    groupId: "management",
    item: {
      to: "/users",
      label: { id: "core.adminNav.item.users", message: "Users" },
      coreIcon: "users",
      order: 100,
      capability: "user:list",
      keywords: [
        { id: "core.adminNav.keyword.accounts", message: "accounts" },
        { id: "core.adminNav.keyword.team", message: "team" },
        { id: "core.adminNav.keyword.people", message: "people" },
      ],
    },
  },
  {
    groupId: "management",
    item: {
      to: "/allowed-domains",
      label: {
        id: "core.adminNav.item.allowedDomains",
        message: "Allowed domains",
      },
      coreIcon: "users",
      order: 150,
      capability: "settings:manage",
      keywords: [
        { id: "core.adminNav.keyword.domains", message: "domains" },
        { id: "core.adminNav.keyword.email", message: "email" },
        { id: "core.adminNav.keyword.signups", message: "signups" },
      ],
    },
  },
  {
    groupId: "management",
    item: {
      to: "/mailer",
      label: { id: "core.adminNav.item.mailer", message: "Mailer" },
      coreIcon: "mail",
      order: 175,
      capability: "settings:manage",
      keywords: [
        { id: "core.adminNav.keyword.email", message: "email" },
        { id: "core.adminNav.keyword.smtp", message: "smtp" },
      ],
    },
  },
  {
    groupId: "management",
    item: {
      to: "/settings",
      label: { id: "core.adminNav.item.settings", message: "Settings" },
      coreIcon: "settings",
      order: 200,
      capability: "settings:manage",
      keywords: [
        { id: "core.adminNav.keyword.configuration", message: "configuration" },
        { id: "core.adminNav.keyword.preferences", message: "preferences" },
        { id: "core.adminNav.keyword.options", message: "options" },
      ],
    },
  },
];

// Default priority for plugin-declared custom groups — sits between
// `term-taxonomies` (200) and `management` (1000). Plugin authors who
// need a different position pass `priority` in the inline group form
// on `registerAdminPage`.
const CUSTOM_NAV_GROUP_PRIORITY = 500;

// Title-case a kebab/snake id when a plugin doesn't declare a label
// inline. `appearance` → `Appearance`, `my-custom-group` → `My custom
// group`. Plugins can override by passing the rich group form.
function humanizeGroupId(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return id;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function seedNavGroups(): Map<string, MutableAdminNavGroup> {
  const groups = new Map<string, MutableAdminNavGroup>();
  for (const g of CORE_NAV_GROUPS) {
    groups.set(g.id, {
      id: g.id,
      label: g.label,
      priority: g.priority,
      items: [],
    });
  }
  for (const { groupId, item } of CORE_NAV_ITEMS) {
    groups.get(groupId)?.items.push(item);
  }
  return groups;
}

function addEntryNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  entries: readonly EntryTypeManifestEntry[],
): void {
  for (const entry of entries) {
    if (entry.showInSidebar !== true) continue;
    groups.get("content")?.items.push({
      to: `/entries/${entry.adminSlug}`,
      label: entry.labels?.plural ?? entry.label,
      order: entry.priority,
      coreIcon: resolveEntryMenuIcon(entry.menuIcon),
      capability: `entry:${entry.capabilityType ?? entry.name}:edit_own`,
      ...(entry.keywords ? { keywords: entry.keywords } : {}),
    });
  }
}

function addTaxonomyNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  taxonomies: readonly TermTaxonomyManifestEntry[],
): void {
  for (const tax of taxonomies) {
    if (tax.showInSidebar !== true) continue;
    groups.get("term-taxonomies")?.items.push({
      to: `/terms/${tax.name}`,
      label: tax.label,
      coreIcon: resolveTaxonomyMenuIcon(tax.menuIcon, tax.isHierarchical),
      capability: `term:${tax.name}:read`,
      ...(tax.keywords ? { keywords: tax.keywords } : {}),
    });
  }
}

function ensureNavGroup(
  groups: Map<string, MutableAdminNavGroup>,
  groupRef: AdminNavGroupRef,
): MutableAdminNavGroup {
  const groupId = typeof groupRef === "string" ? groupRef : groupRef.id;
  const existing = groups.get(groupId);
  if (existing) return existing;
  // Custom group, first occurrence — derive metadata from the inline
  // form when present, else humanize the id.
  const meta = typeof groupRef === "object" ? groupRef : null;
  const created: MutableAdminNavGroup = {
    id: groupId,
    label: meta?.label ?? humanizeGroupId(groupId),
    priority: meta?.priority ?? CUSTOM_NAV_GROUP_PRIORITY,
    items: [],
  };
  groups.set(groupId, created);
  return created;
}

function addAdminPageNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  registry: PluginRegistry,
): void {
  for (const page of registry.adminPages.values()) {
    if (!page.nav) continue;
    ensureNavGroup(groups, page.nav.group).items.push({
      to: `/pages${page.path}`,
      label: page.nav.label,
      order: page.nav.order,
      icon: page.nav.icon,
      coreIcon: page.nav.icon ? undefined : "puzzle",
      component: page.component,
      capability: page.capability,
      ...(page.nav.keywords ? { keywords: page.nav.keywords } : {}),
    });
  }
}

function compareByOrderThenLabel(
  a: { order?: number; label: Label },
  b: { order?: number; label: Label },
): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  return (
    ao - bo || labelSourceText(a.label).localeCompare(labelSourceText(b.label))
  );
}

function compareByPriorityThenId(
  a: { priority?: number; id: string },
  b: { priority?: number; id: string },
): number {
  const ap = a.priority ?? Number.POSITIVE_INFINITY;
  const bp = b.priority ?? Number.POSITIVE_INFINITY;
  return ap - bp || a.id.localeCompare(b.id);
}

function projectAdminNav(
  registry: PluginRegistry,
  entries: readonly EntryTypeManifestEntry[],
  termTaxonomies: readonly TermTaxonomyManifestEntry[],
): readonly AdminNavGroup[] {
  const groups = seedNavGroups();
  addEntryNavItems(groups, entries);
  addTaxonomyNavItems(groups, termTaxonomies);
  addAdminPageNavItems(groups, registry);

  return Array.from(groups.values())
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...g,
      items: g.items.slice().sort(compareByOrderThenLabel),
    }))
    .sort(compareByPriorityThenId);
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

// Synthetic flat-keyspace scope for user meta. Hoisted so the
// `assertUniqueFieldKeysPerScope` callback doesn't re-allocate per
// buildManifest call.
const USER_SCOPE = ["user"] as const;
const getUserScope = (): readonly string[] => USER_SCOPE;

/**
 * Two meta boxes on the same `(scope, field.key)` pair would silently
 * write to the same storage key — a plugin-author footgun. Fail loudly
 * at manifest-build time. `scope` is the entry type (for entry boxes)
 * or termTaxonomy (for term boxes); user boxes collapse to one synthetic
 * scope because the user keyspace is flat.
 */
function assertUniqueFieldKeysPerScope<
  TBox extends {
    readonly id: string;
    readonly fields: readonly MetaBoxFieldManifestEntry[];
  },
>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  kind: "entry" | "term" | "user",
): void {
  const seen = new Map<string, string>();
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      for (const field of box.fields) {
        const scopedKey = `${scope}:${field.key}`;
        const existing = seen.get(scopedKey);
        if (existing !== undefined && existing !== box.id) {
          throw PluginDefinitionError.metaFieldClashAcrossBoxes({
            kind,
            fieldKey: field.key,
            firstBoxId: existing,
            secondBoxId: box.id,
            scope,
          });
        }
        seen.set(scopedKey, box.id);
      }
    }
  }
}

// A media reference stores an id array when `referenceTarget.multiple` is set.
function isMultipleField(field: MetaBoxField): boolean {
  return "referenceTarget" in field && field.referenceTarget.multiple === true;
}

/**
 * A `role`-tagged media field is the entry's single representative image, so at
 * most one `featured` field may exist per entry type and no role field may be a
 * multi-value reference. Reads the raw registry — `role` never reaches the wire
 * projection. Fail at manifest-build so the plugin author sees it on boot.
 */
function assertSingleFeaturedPerEntryType(registry: PluginRegistry): void {
  const featuredByType = new Map<string, string>();
  for (const box of registry.entryMetaBoxes.values()) {
    for (const field of box.fields) {
      if (field.role === undefined) continue;
      if (isMultipleField(field)) {
        throw PluginDefinitionError.roleFieldMustBeSingle({
          fieldKey: field.key,
          role: field.role,
        });
      }
      if (field.role !== "featured") continue;
      for (const entryType of box.entryTypes) {
        const existing = featuredByType.get(entryType);
        if (existing !== undefined && existing !== field.key) {
          throw PluginDefinitionError.entryHasMultipleFeaturedFields({
            scope: entryType,
            firstFieldKey: existing,
            secondFieldKey: field.key,
          });
        }
        featuredByType.set(entryType, field.key);
      }
    }
  }
}

// A meta box referencing an unregistered scope ("catagory" typo, a
// termTaxonomy removed behind the plugin's back, etc.) is dead code — the
// box never renders and never writes. Fail at manifest build so the
// plugin author sees it on boot, not at first admin click. Matches the
// settings-page→group reference check.
function assertMetaBoxScopesExist<TBox extends { readonly id: string }>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  known: ReadonlySet<string>,
  boxKind: string,
  scopeKind: string,
): void {
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      if (!known.has(scope)) {
        throw PluginDefinitionError.metaBoxReferencesUnknownScope({
          boxKind,
          boxId: box.id,
          scopeKind,
          scope,
        });
      }
    }
  }
}

// Surfacing a clear error at manifest-build time beats a runtime
// "unknown group" in the admin route. Pages reference groups by name;
// if a group name doesn't resolve, the plugin author has a typo or
// order-of-registration problem.
function assertSettingsPageGroupsExist(
  pages: readonly SettingsPageManifestEntry[],
  groups: ReadonlyMap<string, RegisteredSettingsGroup>,
): void {
  for (const page of pages) {
    for (const groupName of page.groups) {
      if (!groups.has(groupName)) {
        throw PluginDefinitionError.settingsPageReferencesUnknownGroup({
          pageName: page.name,
          groupName,
        });
      }
    }
  }
}

function assertUniqueAdminSlugs(
  entries: readonly EntryTypeManifestEntry[],
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const existing = seen.get(entry.adminSlug);
    if (existing !== undefined) {
      throw DuplicateAdminSlugError.slugCollision({
        firstPostType: existing,
        secondPostType: entry.name,
        slug: entry.adminSlug,
      });
    }
    seen.set(entry.adminSlug, entry.name);
  }
}

/**
 * Derive the URL-safe admin slug for a post type. Prefers `plural` when
 * set (allows "fish" → `fish`, "children" → `children`, etc.), falls back
 * to `${name}s` which is English-biased but matches the common case.
 * Non-alphanumerics collapse to single dashes; leading/trailing dashes
 * are trimmed. Empty results throw — an empty slug would shadow
 * `/entries/` itself in TanStack Router.
 */
export function deriveAdminSlug(name: string, plural?: string): string {
  const source = plural ?? `${name}s`;
  const slug = slugify(source);
  if (slug.length === 0) {
    const from = plural === undefined ? "its name" : `plural="${plural}"`;
    throw PluginDefinitionError.adminSlugDerivationFailed({
      entryTypeName: name,
      from,
    });
  }
  return slug;
}

// Hand-rolled single-pass slugifier rather than chained `.replace()` calls.
// The regex form (`/[^a-z0-9]+/g` plus a trim) trips CodeQL's polynomial-
// regex detector on library-exposed inputs; this loop is provably O(n),
// regex-free, and produces the same output: lowercase ASCII alphanumerics
// separated by single dashes, no leading/trailing dashes.
function slugify(input: string): string {
  const lower = input.toLowerCase();
  let result = "";
  let pendingDash = false;
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const isAlphaNum =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      if (pendingDash && result.length > 0) result += "-";
      result += lower[i];
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}

// Explicit allowlist — only the destructured keys ship to the browser.
// Adding a field to `EntryTypeOptions` / `RegisteredEntryType` does NOT
// automatically leak it; it must be added here AND to `EntryTypeManifestEntry`
// to surface in the admin. `registeredBy`, `rewrite`, `capabilities`, and
// the raw per-surface visibility inputs are intentionally excluded — the
// resolved `isPublic` / `showUI` / `showInSidebar` triple is what the
// admin consumes, and `capabilities` is server-side authorization metadata.
function toEntryTypeManifest(
  pt: RegisteredEntryType,
  namedTemplates?: readonly NamedTemplateChoice[],
): EntryTypeManifestEntry {
  const {
    name,
    label,
    labels,
    description,
    supports,
    termTaxonomies,
    isHierarchical,
    hasArchive,
    capabilityType,
    priority,
    menuIcon,
    keywords,
    versioning,
  } = pt as RegisteredEntryType & {
    readonly versioning?: EntryTypeManifestEntry["versioning"];
  };
  const visibility = resolveEntryTypeVisibility(pt);
  return {
    name,
    adminSlug: deriveAdminSlug(
      name,
      labels?.plural !== undefined ? labelSourceText(labels.plural) : undefined,
    ),
    label,
    labels,
    description,
    supports,
    termTaxonomies,
    isHierarchical,
    isPublic: visibility.isPublic,
    showUI: visibility.showUI,
    showInSidebar: visibility.showInSidebar,
    hasArchive,
    capabilityType,
    priority,
    menuIcon,
    keywords,
    versioning: deriveVersioning(supports, versioning),
    ...(namedTemplates && namedTemplates.length > 0 ? { namedTemplates } : {}),
    ...accessPoliciesManifest(pt.access),
  };
}

// Project the editor-selectable policies to `{ key, label }` — the resolver
// stays server-side. Omitted entirely when the type declares no selectable
// space, so the admin picker only appears where there's a real choice.
function accessPoliciesManifest(access: EntryTypeAccess | undefined): {
  accessPolicies?: readonly AccessPolicyChoice[];
} {
  const policies = access?.policies;
  if (!policies || policies.length === 0) return {};
  return {
    accessPolicies: policies.map(({ key, label }) => ({ key, label })),
  };
}

// Versioning is derived: if the type opts into `supports: ['revisions']`,
// fill in defaults the admin can read without nil-checking. If the
// type doesn't support revisions, `versioning` stays undefined and
// the editor knows to skip the Revisions Sheet entirely.
function deriveVersioning(
  supports: readonly string[] | undefined,
  declared: EntryTypeManifestEntry["versioning"] | undefined,
): EntryTypeManifestEntry["versioning"] | undefined {
  if (!supports?.includes("revisions")) return undefined;
  return {
    maxRevisions: declared?.maxRevisions ?? 25,
    autosaveIntervalSeconds: declared?.autosaveIntervalSeconds ?? 60,
  };
}

// Allowlist for termTaxonomy entries — same rationale as `toEntryTypeManifest`.
// `registeredBy`, `capabilities`, `isInQuickEdit`, `hasAdminColumn`, and
// `rewrite` stay server-side. Visibility is projected via the resolver so
// the admin sees the same resolved triple as for entry types.
function toTermTaxonomyEntry(
  tax: RegisteredTermTaxonomy,
): TermTaxonomyManifestEntry {
  const {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
    menuIcon,
    keywords,
  } = tax;
  const visibility = resolveTermTaxonomyVisibility(tax);
  return {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
    isPublic: visibility.isPublic,
    showUI: visibility.showUI,
    showInSidebar: visibility.showInSidebar,
    menuIcon,
    keywords,
  };
}

function resolveEntryMenuIcon(menuIcon: string | undefined): CoreIconName {
  if (
    menuIcon !== undefined &&
    ENTRY_MENU_ICONS.has(menuIcon as CoreIconName)
  ) {
    return menuIcon as CoreIconName;
  }
  return "content";
}

function resolveTaxonomyMenuIcon(
  menuIcon: string | undefined,
  isHierarchical: boolean | undefined,
): CoreIconName {
  if (
    menuIcon !== undefined &&
    TAXONOMY_MENU_ICONS.has(menuIcon as CoreIconName)
  ) {
    return menuIcon as CoreIconName;
  }
  return isHierarchical === true ? "folder" : "tag";
}

// Allowlist for entry meta box entries — same rationale as
// `toEntryTypeManifest`. `registeredBy` is intentionally excluded
// (server-only debug metadata). `sanitize` on each field is stripped
// via `toEntryMetaBoxFieldEntry` — it's a server-side callback. `span`
// is also stripped: the editor rail renders every entry field at full
// width, and shipping a hint the renderer ignores just bloats the wire.
function toEntryMetaBoxEntry(
  box: RegisteredEntryMetaBox,
): EntryMetaBoxManifestEntry {
  const {
    id,
    label,
    description,
    // Deprecated with no replacement by design: the editor ignores it, but it
    // stays on the wire so plugins that still set it keep validating.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    location,
    priority,
    entryTypes,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    location,
    priority,
    entryTypes,
    capability,
    fields: fields.map(toEntryMetaBoxFieldEntry),
  };
}

// Term meta boxes are always stacked top-to-bottom on the termTaxonomy
// edit form — no `location` hint applies.
function toTermMetaBoxEntry(
  box: RegisteredTermMetaBox,
): TermMetaBoxManifestEntry {
  const {
    id,
    label,
    description,
    priority,
    termTaxonomies,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    priority,
    termTaxonomies,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// User meta boxes are stacked like term boxes — no scope / location.
function toUserMetaBoxEntry(
  box: RegisteredUserMetaBox,
): UserMetaBoxManifestEntry {
  const { id, label, description, priority, capability, fields } = box;
  return {
    id,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Allowlist for settings group entries — same rationale as the other
// `to*Entry` projections. `registeredBy` is server-only debug metadata.
// Fields ship through `toMetaBoxFieldEntry` — same projection as every
// other meta surface.
function toSettingsGroupEntry(
  group: RegisteredSettingsGroup,
): SettingsGroupManifestEntry {
  const { name, label, description, priority, capability, fields } = group;
  return {
    name,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

function toSettingsPageEntry(
  page: RegisteredSettingsPage,
): SettingsPageManifestEntry {
  const { name, label, description, groups, priority } = page;
  return { name, label, description, groups, priority };
}

function toFieldTypeEntry(
  fieldType: RegisteredFieldType,
): FieldTypeManifestEntry {
  const { type, component } = fieldType;
  return { type, component };
}

function toDashboardWidgetEntry(
  widget: RegisteredDashboardWidget,
): DashboardWidgetManifestEntry {
  const { id, title, capability, component, priority } = widget;
  return { id, title, capability, component, priority };
}

function toBlockEntry(spec: BlockSpec): BlockManifestEntry {
  const {
    name,
    title,
    category,
    icon,
    description,
    keywords,
    inserter,
    variations,
  } = spec;
  return {
    name: name,
    title: title ?? name,
    category,
    icon,
    description,
    keywords,
    inserter,
    variations,
  };
}

function toPatternEntry(pattern: RegisteredPattern): PatternManifestEntry {
  const {
    name,
    title,
    category,
    keywords,
    content,
    insert,
    preview,
    target,
    entryTypes,
    priority,
  } = pattern.spec;
  return {
    name,
    title,
    category,
    keywords,
    insert: insert ?? "copy",
    preview,
    target,
    entryTypes,
    priority,
    content,
  };
}

function toMarkEntry(mark: RegisteredMark): MarkManifestEntry {
  const {
    name,
    title,
    description,
    keyboardShortcut,
    bubbleMenuLabel,
    bubbleMenuIcon,
    adminSchema,
  } = mark.spec;
  return {
    name,
    title,
    description,
    keyboardShortcut,
    bubbleMenuLabel,
    bubbleMenuIcon,
    adminSchema,
  };
}

// Per-variant options live on each narrowed variant of `MetaBoxField`.
// Reading via this explicit projection lets the serializer stay
// variant-agnostic — narrowed variants that don't carry a given
// option read back `undefined`, and the wire shape stays uniform
// regardless of which variant produced the field. `min` / `max` widen
// to `number | string` because date / datetime / time variants store
// ISO-string bounds while `number` stores numeric bounds; the wire
// shape mirrors that union and renderers branch on `inputType`.
interface MetaBoxFieldOptionView {
  readonly placeholder?: Label;
  readonly maxLength?: number;
  readonly min?: number | string;
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  readonly multiple?: boolean;
  readonly appearance?: SelectAppearance;
  readonly onText?: Label;
  readonly offText?: Label;
  readonly referenceTarget?: ReferenceTarget;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  readonly subFields?: readonly MetaBoxField[];
  /** Group member fields — projected into the wire `subFields` slot. */
  readonly fields?: readonly MetaBoxField[];
  readonly addLabel?: Label;
  readonly layout?: RepeaterLayout;
  readonly collapsed?: string;
  readonly dialogSize?: RepeaterDialogSize;
}

function toEntryMetaBoxFieldEntry(
  field: MetaBoxField,
): EntryMetaBoxFieldManifestEntry {
  const view = field as MetaBoxFieldOptionView;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    inputType: field.inputType,
    description: field.description,
    required: field.required,
    prepend: field.prepend,
    append: field.append,
    placeholder: view.placeholder,
    maxLength: view.maxLength,
    min: view.min,
    max: view.max,
    step: view.step,
    options: view.options,
    multiple: view.multiple,
    appearance: view.appearance,
    onText: view.onText,
    offText: view.offText,
    default: field.default,
    referenceTarget: view.referenceTarget,
    marks: view.marks,
    nodes: view.nodes,
    blocks: view.blocks,
    capability: field.capability,
    visibleWhen: field.visibleWhen,
    addLabel: view.addLabel,
    layout: view.layout,
    collapsed: view.collapsed,
    dialogSize: view.dialogSize,
    // Repeater subfields and group members recurse through
    // `toMetaBoxFieldEntry` into the uniform wire `subFields` slot — the same
    // shape as a top-level field, keeping each child's `span` (the row-editor
    // dialog / group grid honour it, unlike the entry rail that drops the
    // top-level hint) and stripping sanitize callbacks (server-only). The
    // renderer branches on `inputType` to read them as rows / members.
    subFields: (view.subFields ?? view.fields)?.map((sf) =>
      toMetaBoxFieldEntry(sf),
    ),
  };
}

// A subfield / member keeps its `span` (the entry projection drops it); the
// composite editors lay children out on their own 12-column grid. Children
// recurse via `toEntryMetaBoxFieldEntry`, which maps `subFields` back here.
function toMetaBoxFieldEntry(field: MetaBoxField): MetaBoxFieldManifestEntry {
  return { ...toEntryMetaBoxFieldEntry(field), span: field.span };
}

/**
 * Serialise a manifest into the `<script>` markup injected into the admin
 * `index.html`. The payload lives inside a `type="application/json"` block,
 * so it isn't executed — but a stray `</script>` sequence would still end
 * the tag and leak the remainder into the document. Escape the slash to
 * neutralise that, which is the standard JSON-in-HTML-script hardening.
 */
export function serializeManifestScript(manifest: PlumixManifest): string {
  const safe = JSON.stringify(manifest).replaceAll("</", "<\\/");
  return `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">${safe}</script>`;
}

// Case-insensitive match on the script tag — Vite's bundler today emits
// lowercase tags and we control the placeholder, but minifiers upstream
// could normalise to uppercase and we'd rather match than silently fall
// through to the fail-fast branch.
const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
  "i",
);

/**
 * Replace the `<script id="plumix-manifest">` placeholder in the admin's
 * `index.html` with a freshly serialised manifest. Throws if the placeholder
 * is missing — that's an indicator that the admin bundle is out of date
 * (was built without the placeholder), and silently appending would mask
 * the staleness.
 */
export function injectManifestIntoHtml(
  html: string,
  manifest: PlumixManifest,
): string {
  if (!MANIFEST_SCRIPT_RE.test(html)) {
    throw PluginDefinitionError.adminManifestPlaceholderMissing({
      scriptId: MANIFEST_SCRIPT_ID,
    });
  }
  return html.replace(MANIFEST_SCRIPT_RE, serializeManifestScript(manifest));
}
