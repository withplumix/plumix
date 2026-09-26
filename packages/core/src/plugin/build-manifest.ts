// Build-time manifest projection — the build half of the plugin system. Reads a
// `PluginRegistry` snapshot and projects it into the wire `PlumixManifest`
// (`manifest-types.ts`) the admin bundle consumes: `buildManifest`, the
// `to*Entry` projectors (the per-field one lives in
// `fields/manifest-entry.ts`), the registration-time assertions, admin-slug
// derivation and admin-nav assembly. Its build-time caller is the plumix Vite
// plugin; the runtime reads `collectContributedBlocks` and `deriveAdminSlug`.
// Re-exported unchanged from the public `@plumix/core/manifest` barrel.

import type { BlockSpec, ThemeBreakpoints, ThemeTokens } from "@plumix/blocks";
import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";

import type { Label } from "../i18n/label.js";
import type { ResolvedI18n } from "../i18n/locale-registry.js";
import type { NamedTemplateChoice } from "../route/render/template-builders.js";
import type { PluginI18nSlot } from "./define.js";
import type { MetaBoxFieldManifestEntry } from "./fields/manifest-entry.js";
import type { MetaBoxField } from "./fields/meta-box-field.js";
import type {
  AccessPolicyChoice,
  AdminNavGroup,
  AdminNavItem,
  BlockManifestEntry,
  BuiltManifest,
  CoreIconName,
  DashboardWidgetManifestEntry,
  EntryMetaBoxFieldManifestEntry,
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  FieldTypeManifestEntry,
  MarkManifestEntry,
  PatternManifestEntry,
  PluginI18nManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TermMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
  UserMetaBoxManifestEntry,
} from "./manifest-types.js";
import type {
  AdminNavGroupRef,
  EntryMenuIcon,
  EntryTypeAccess,
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
  TaxonomyMenuIcon,
} from "./registry.js";
import { entryCapability } from "../entries/capabilities.js";
import { labelSourceText } from "../i18n/label.js";
import { DuplicateAdminSlugError, PluginDefinitionError } from "./errors.js";
import { toMetaBoxFieldEntry } from "./fields/manifest-entry.js";
import { resolveImageRoleIndex } from "./image-roles.js";
import { byPriorityThen, CORE_NAV_GROUPS } from "./manifest-types.js";
import { pluginCatalogUrl } from "./plugin-catalog-path.js";
import { ENTRY_MENU_ICONS, TAXONOMY_MENU_ICONS } from "./registry.js";

// Runtime lookups for `resolveEntryMenuIcon`/`resolveTaxonomyMenuIcon` below,
// built from the same rosters `EntryTypeOptions.menuIcon` and
// `TermTaxonomyOptions.menuIcon` are typed against (`registry.ts`) — the type
// and the fallback check can't drift apart. Names outside these sets fall
// back to a sensible default at projection time (a stale-compiled plugin can
// still emit one at runtime despite the closed type).
const ENTRY_MENU_ICON_SET: ReadonlySet<EntryMenuIcon> = new Set(
  ENTRY_MENU_ICONS,
);
const TAXONOMY_MENU_ICON_SET: ReadonlySet<TaxonomyMenuIcon> = new Set(
  TAXONOMY_MENU_ICONS,
);

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
  resolveImageRoleIndex(registry);
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
      to: "/field-values",
      label: { id: "core.adminNav.item.fieldValues", message: "Field values" },
      coreIcon: "settings",
      order: 190,
      capability: "settings:manage",
      keywords: [
        { id: "core.adminNav.keyword.import", message: "import" },
        { id: "core.adminNav.keyword.meta", message: "meta" },
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
    if (!entry.showInSidebar) continue;
    groups.get("content")?.items.push({
      to: `/entries/${entry.adminSlug}`,
      label: entry.labels?.plural ?? entry.label,
      order: entry.priority,
      coreIcon: resolveEntryMenuIcon(entry.menuIcon),
      capability: entryCapability(entry, "edit_own"),
      ...(entry.keywords ? { keywords: entry.keywords } : {}),
    });
  }
}

function addTaxonomyNavItems(
  groups: Map<string, MutableAdminNavGroup>,
  taxonomies: readonly TermTaxonomyManifestEntry[],
): void {
  for (const tax of taxonomies) {
    if (!tax.showInSidebar) continue;
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
// to surface in the admin. `registeredBy`, `rewrite`, `capabilities`,
// `excludeFromGenericRpc` and `excludeFromSearch` stay server-side;
// `capabilities` is authorization metadata.
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
    isPublic,
    showUI,
    showInSidebar,
  } = pt as RegisteredEntryType & {
    readonly versioning?: EntryTypeManifestEntry["versioning"];
  };
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
    isPublic,
    showUI,
    showInSidebar,
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
// `rewrite` stay server-side.
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
    isPublic,
    showUI,
    showInSidebar,
    menuIcon,
    keywords,
  } = tax;
  return {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
    isPublic,
    showUI,
    showInSidebar,
    menuIcon,
    keywords,
  };
}

function resolveEntryMenuIcon(menuIcon: string | undefined): CoreIconName {
  if (
    menuIcon !== undefined &&
    ENTRY_MENU_ICON_SET.has(menuIcon as EntryMenuIcon)
  ) {
    return menuIcon as EntryMenuIcon;
  }
  return "content";
}

function resolveTaxonomyMenuIcon(
  menuIcon: string | undefined,
  isHierarchical: boolean | undefined,
): CoreIconName {
  if (
    menuIcon !== undefined &&
    TAXONOMY_MENU_ICON_SET.has(menuIcon as TaxonomyMenuIcon)
  ) {
    return menuIcon as TaxonomyMenuIcon;
  }
  return isHierarchical === true ? "folder" : "tag";
}

function toEntryMetaBoxFieldEntry(
  field: MetaBoxField,
): EntryMetaBoxFieldManifestEntry {
  const { span: _span, ...entry } = toMetaBoxFieldEntry(field);
  return entry;
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
