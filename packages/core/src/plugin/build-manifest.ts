import type {
  Capability,
  CapabilityNamespaces,
} from "../access/contract/capability.js";
import type {
  BlockRegistry,
  BlockSpec,
  ThemeBreakpoints,
  ThemeTokens,
} from "../blocks/index.js";
import type { ResolvedI18n } from "../config.js";
import type { AdminArea } from "../context/runtime-adapter.js";
import type { Label } from "../i18n/label.js";
import type { NamedTemplateChoice } from "../route/contract/named-template.js";
import type { PluginI18nSlot } from "./define.js";
import type { MetaBoxFieldManifestEntry } from "./fields/manifest-entry.js";
import type { MetaBoxField } from "./fields/meta-box-field.js";
import type {
  AccessPolicyChoice,
  AdminNavGroup,
  AdminNavItem,
  BlockManifestEntry,
  BuiltManifest,
  ConfiguredSlots,
  CoreIconName,
  DashboardWidgetManifestEntry,
  EntryMetaBoxFieldManifestEntry,
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  FieldTypeManifestEntry,
  InfrastructureSlot,
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
import {
  resolveCapability,
  spellTermCapability,
} from "../access/contract/capability.js";
import { namespacedEntryCapability } from "../access/contract/entry-capabilities.js";
import {
  coreBlocks,
  createBlockRegistry,
  DEFAULT_BREAKPOINTS,
} from "../blocks/index.js";
import { assignPatternIds } from "../blocks/pattern-registry.js";
import { labelSourceText } from "../i18n/label.js";
import { DuplicateAdminSlugError, PluginDefinitionError } from "./errors.js";
import { projectMetaBoxField } from "./fields/project-field.js";
import { resolveImageRoleIndex } from "./image-roles.js";
import {
  byPriorityThen,
  configuredSlotsOf,
  CORE_NAV_GROUPS,
} from "./manifest-types.js";
import { pluginCatalogUrl } from "./plugin-catalog-path.js";
import { ENTRY_MENU_ICONS, TAXONOMY_MENU_ICONS } from "./registry.js";

/**
 * Checked at runtime too: a stale-compiled plugin can emit a name outside the
 * closed type, which falls back to a default.
 */
const ENTRY_MENU_ICON_SET: ReadonlySet<EntryMenuIcon> = new Set(
  ENTRY_MENU_ICONS,
);
const TAXONOMY_MENU_ICON_SET: ReadonlySet<TaxonomyMenuIcon> = new Set(
  TAXONOMY_MENU_ICONS,
);

/**
 * Theme specs win a name clash over plugin specs, matching the runtime block
 * registry.
 */
export function collectContributedBlocks(
  registeredBlocks: Iterable<RegisteredBlock>,
  themeBlocks: readonly BlockSpec[] = [],
): readonly BlockSpec[] {
  // Deduped by name, theme last so it wins a clash — matching the last-write-
  // wins the runtime registry gives it, so `buildManifest` and `buildApp`
  // agree.
  const byName = new Map<string, BlockSpec>();
  for (const { spec } of registeredBlocks) byName.set(spec.name, spec);
  for (const spec of themeBlocks) byName.set(spec.name, spec);
  return [...byName.values()];
}

/**
 * Prioritised surfaces sort by `priority`, ties by name/id, so order ignores
 * install order. Throws `DuplicateAdminSlugError` when two entry types share an
 * admin slug.
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
     * Theme `blocks`; they win a name clash with plugin blocks.
     */
    readonly blocks?: readonly BlockSpec[];
    readonly i18n?: ResolvedI18n;
    readonly plugins?: readonly {
      readonly id: string;
      readonly i18n?: PluginI18nSlot;
    }[];
    /**
     * Plugins whose catalogs the admin bundle already bakes in; emitting URLs
     * for them would double-load. Read only alongside `plugins`.
     */
    readonly adminBundledPluginIds?: ReadonlySet<string>;
    /** Routed through options — like `tokens` — because slot presence is
     *  read off the site config, not the plugin registry. Omitted means no
     *  slot is configured. */
    readonly configuredSlots?: ConfiguredSlots;
    /** Routed through options — like `configuredSlots` — because the
     *  runtime declares them, not the plugin registry. Omitted means the
     *  deployment refuses none. */
    readonly refusedAdminAreas?: readonly AdminArea[];
  },
): BuiltManifest {
  const configuredSlots = options?.configuredSlots ?? configuredSlotsOf({});
  const refusedAdminAreas = options?.refusedAdminAreas ?? [];
  const entries = Array.from(registry.entryTypes.values())
    .map((pt) => toEntryTypeManifest(pt, options?.namedTemplates?.[pt.name]))
    .sort(byPriorityThen((e) => e.name));
  assertUniqueAdminSlugs(entries);
  const termTaxonomies = Array.from(registry.termTaxonomies.values()).map(
    toTermTaxonomyEntry,
  );
  const entryMetaBoxes = Array.from(registry.entryMetaBoxes.values())
    .map((box) => toEntryMetaBoxEntry(box, registry))
    .sort(byPriorityThen((b) => b.id));
  const termMetaBoxes = Array.from(registry.termMetaBoxes.values())
    .map((box) => toTermMetaBoxEntry(box, registry))
    .sort(byPriorityThen((b) => b.id));
  const userMetaBoxes = Array.from(registry.userMetaBoxes.values())
    .map((box) => toUserMetaBoxEntry(box, registry))
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
    .map((group) => toSettingsGroupEntry(group, registry))
    .sort(byPriorityThen((g) => g.name));
  const settingsPages = Array.from(registry.settingsPages.values())
    .map(toSettingsPageEntry)
    .sort(byPriorityThen((p) => p.name));
  assertSettingsPageGroupsExist(settingsPages, registry.settingsGroups);
  const adminNav = projectAdminNav(
    registry,
    entries,
    termTaxonomies,
    configuredSlots,
    refusedAdminAreas,
  );
  const dashboardWidgets = Array.from(registry.dashboardWidgets.values())
    .map((widget) => toDashboardWidgetEntry(widget, registry))
    .sort(byPriorityThen((w) => w.id));
  const fieldTypes = Array.from(registry.fieldTypes.values())
    .map(toFieldTypeEntry)
    .sort((a, b) => a.type.localeCompare(b.type));
  const contributedBlocks = collectContributedBlocks(
    registry.blockSpecs.values(),
    options?.blocks,
  );
  const blocks = contributedBlocks
    .map(toBlockEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  const marks = Array.from(registry.markSpecs.values())
    .map(toMarkEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  // The same precedence the runtime registry gives (core < plugin < theme), so
  // a pattern's slots are the ones its blocks render with.
  const blockSpecs = createBlockRegistry([...coreBlocks, ...contributedBlocks]);
  const patterns = Array.from(registry.patternSpecs.values())
    .map((pattern) => toPatternEntry(pattern, blockSpecs))
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
    configuredSlots,
    refusedAdminAreas,
    frameworkRoutes: { author: registry.frameworkRoutes.author },
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
      // With no site i18n, keep the plugin's full locale list.
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

/**
 * Capability gating happens in the admin. A `slot`, `area` or `settingsPages`
 * row is dropped when the deployment can't serve it: the user may, but the site
 * can't.
 */
const CORE_NAV_ITEMS: readonly {
  groupId: string;
  slot?: InfrastructureSlot;
  area?: AdminArea;
  settingsPages?: true;
  item: AdminNavItem;
}[] = [
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
    slot: "mailer",
    area: "emailDelivery",
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
    settingsPages: true,
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

/**
 * Default priority for plugin-declared custom groups — sits between
 * `term-taxonomies` (200) and `management` (1000). Plugin authors who
 * need a different position pass `priority` in the inline group form
 * on `registerAdminPage`.
 */
const CUSTOM_NAV_GROUP_PRIORITY = 500;

/**
 * Title-case a kebab/snake id when a plugin doesn't declare a label
 * inline. `appearance` → `Appearance`, `my-custom-group` → `My custom
 * group`. Plugins can override by passing the rich group form.
 */
function humanizeGroupId(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return id;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function seedNavGroups(
  configuredSlots: ConfiguredSlots,
  refusedAdminAreas: readonly AdminArea[],
  hasSettingsPages: boolean,
): Map<string, MutableAdminNavGroup> {
  const groups = new Map<string, MutableAdminNavGroup>();
  for (const g of CORE_NAV_GROUPS) {
    groups.set(g.id, {
      id: g.id,
      label: g.label,
      priority: g.priority,
      items: [],
    });
  }
  for (const { groupId, slot, area, settingsPages, item } of CORE_NAV_ITEMS) {
    if (slot !== undefined && !configuredSlots[slot]) continue;
    if (area !== undefined && refusedAdminAreas.includes(area)) continue;
    if (settingsPages && !hasSettingsPages) continue;
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
      capability: namespacedEntryCapability(entry, "edit_own"),
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
      capability: spellTermCapability(tax.name, "read"),
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
      capability: shippedCapability(registry, page.capability),
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
  configuredSlots: ConfiguredSlots,
  refusedAdminAreas: readonly AdminArea[],
): readonly AdminNavGroup[] {
  const groups = seedNavGroups(
    configuredSlots,
    refusedAdminAreas,
    registry.settingsPages.size > 0,
  );
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
 * Synthetic flat-keyspace scope for user meta. Hoisted so the
 * `assertUniqueFieldKeysPerScope` callback doesn't re-allocate per
 * buildManifest call.
 */
const USER_SCOPE = ["user"] as const;
const getUserScope = (): readonly string[] => USER_SCOPE;

/** Two boxes on one `(scope, field.key)` would silently share a storage key. */
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

/**
 * A box on an unregistered scope never renders or writes; fail at boot rather
 * than at first admin click.
 */
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

/**
 * Catch a typo'd group name at build, not as an "unknown group" in the admin.
 */
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
 * Falls back to `${name}s` without `plural`. Throws when the slug is empty,
 * since it would shadow `/entries/` itself.
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

/**
 * A loop, not `/[^a-z0-9]+/g` plus a trim: CodeQL flags that regex as
 * polynomial on library-exposed input.
 */
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

/**
 * Allowlist, so a new `RegisteredEntryType` field reaches the browser only when
 * added here.
 */
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

/**
 * Omitted when no policy is selectable, so the admin picker appears only with a
 * real choice.
 */
function accessPoliciesManifest(access: EntryTypeAccess | undefined): {
  accessPolicies?: readonly AccessPolicyChoice[];
} {
  const policies = access?.policies;
  if (!policies || policies.length === 0) return {};
  return {
    accessPolicies: policies.map(({ key, label }) => ({ key, label })),
  };
}

/**
 * Defaults let the admin read versioning without nil-checks; undefined tells
 * the editor to skip the Revisions sheet.
 */
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

/**
 * Allowlist for termTaxonomy entries — same rationale as `toEntryTypeManifest`.
 * `registeredBy`, `capabilities`, `isInQuickEdit`, `hasAdminColumn`, and
 * `rewrite` stay server-side.
 */
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

/**
 * Whatever leaves the server is a string: the admin compares capabilities
 * against the session's granted list, so a reference is spelled here.
 */
function shippedCapability(
  registry: CapabilityNamespaces,
  capability: Capability | undefined,
): string | undefined {
  return capability === undefined
    ? undefined
    : resolveCapability(registry, capability);
}

function toEntryMetaBoxFieldEntry(
  field: MetaBoxField,
  registry: CapabilityNamespaces,
): EntryMetaBoxFieldManifestEntry {
  const { span: _span, ...entry } = projectMetaBoxField(field, registry);
  return entry;
}

/**
 * Allowlist like `toEntryTypeManifest`. `span` is stripped: the editor rail
 * renders every entry field full width.
 */
function toEntryMetaBoxEntry(
  box: RegisteredEntryMetaBox,
  registry: CapabilityNamespaces,
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
    capability: shippedCapability(registry, capability),
    fields: fields.map((field) => toEntryMetaBoxFieldEntry(field, registry)),
  };
}

/**
 * Term meta boxes are always stacked top-to-bottom on the termTaxonomy
 * edit form — no `location` hint applies.
 */
function toTermMetaBoxEntry(
  box: RegisteredTermMetaBox,
  registry: CapabilityNamespaces,
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
    capability: shippedCapability(registry, capability),
    fields: fields.map((field) => projectMetaBoxField(field, registry)),
  };
}

/** User meta boxes are stacked like term boxes — no scope / location. */
function toUserMetaBoxEntry(
  box: RegisteredUserMetaBox,
  registry: CapabilityNamespaces,
): UserMetaBoxManifestEntry {
  const { id, label, description, priority, capability, fields } = box;
  return {
    id,
    label,
    description,
    priority,
    capability: shippedCapability(registry, capability),
    fields: fields.map((field) => projectMetaBoxField(field, registry)),
  };
}

/**
 * Allowlist for settings group entries — same rationale as the other
 * `to*Entry` projections. `registeredBy` is server-only debug metadata.
 * Fields ship through `projectMetaBoxField` — same projection as every
 * other meta surface.
 */
function toSettingsGroupEntry(
  group: RegisteredSettingsGroup,
  registry: CapabilityNamespaces,
): SettingsGroupManifestEntry {
  const { name, label, description, priority, capability, fields } = group;
  return {
    name,
    label,
    description,
    priority,
    capability: shippedCapability(registry, capability),
    fields: fields.map((field) => projectMetaBoxField(field, registry)),
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
  registry: CapabilityNamespaces,
): DashboardWidgetManifestEntry {
  const { id, title, capability, component, priority } = widget;
  return {
    id,
    title,
    capability: shippedCapability(registry, capability),
    component,
    priority,
  };
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

function toPatternEntry(
  pattern: RegisteredPattern,
  blocks: BlockRegistry,
): PatternManifestEntry {
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
    content: assignPatternIds(content, blocks),
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
