import type { AdminArea, JsonObject } from "@plumix/core";
import type { ThemeBreakpoints, ThemeTokens } from "@plumix/core/blocks";
import type {
  AccessPolicyChoice,
  AdminNavGroup,
  AdminNavItem,
  ConfiguredSlots,
  DashboardWidgetManifestEntry,
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  NamedTemplateChoice,
  PatternManifestEntry,
  PlumixManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TermMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
import { DEFAULT_BREAKPOINTS } from "@plumix/core/blocks";
import {
  byPriorityThen,
  configuredSlotsOf,
  entryTypeCapability,
  MANIFEST_SCRIPT_ID,
  termTaxonomyCapability,
} from "@plumix/core/manifest";

export function readManifest(doc: Document = document): PlumixManifest {
  const el = doc.getElementById(MANIFEST_SCRIPT_ID);
  if (!el) return {};
  const text = el.textContent;
  if (text.trim() === "") return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return normalize(parsed);
  } catch {
    console.error(
      `[plumix] failed to parse #${MANIFEST_SCRIPT_ID} payload; falling back to an empty manifest`,
    );
    return {};
  }
}

// Booleans, not "array" / "object" literals, which would trip
// `lingui/no-unlocalized-strings`.
const MANIFEST_FIELD_IS_ARRAY = {
  entryTypes: true,
  termTaxonomies: true,
  entryMetaBoxes: true,
  termMetaBoxes: true,
  userMetaBoxes: true,
  settingsGroups: true,
  settingsPages: true,
  adminNav: true,
  dashboardWidgets: true,
  fieldTypes: true,
  blocks: true,
  marks: true,
  patterns: true,
  tokens: false,
  breakpoints: false,
  i18n: false,
  pluginI18n: false,
  configuredSlots: false,
  refusedAdminAreas: true,
  frameworkRoutes: false,
} as const satisfies Record<keyof PlumixManifest, boolean>;

// Drops, not coerces: the payload is build-generated, so a bad shape means the
// build is broken upstream.
function normalize(value: unknown): PlumixManifest {
  if (!value || typeof value !== "object") return {};
  const v = value as JsonObject;
  const result: Record<string, unknown> = {};
  for (const [key, isArray] of Object.entries(MANIFEST_FIELD_IS_ARRAY)) {
    const raw = v[key];
    const matches = isArray
      ? Array.isArray(raw)
      : Boolean(raw) && typeof raw === "object";
    if (matches) result[key] = raw;
  }
  return result;
}

// Parsed on first read: a module imported before the manifest `<script>`
// exists would cache an empty snapshot forever.
let snapshot: PlumixManifest | undefined;

function currentManifest(): PlumixManifest {
  return (snapshot ??= readManifest());
}

/** @internal Test-only. Drops the parsed snapshot so the next read picks up a
 *  freshly written `<script>` payload. */
export function _resetManifest(): void {
  snapshot = undefined;
}

export function getThemeTokens(
  source: PlumixManifest = currentManifest(),
): ThemeTokens {
  return source.tokens ?? {};
}

export function getThemeBreakpoints(
  source: PlumixManifest = currentManifest(),
): ThemeBreakpoints {
  return source.breakpoints ?? DEFAULT_BREAKPOINTS;
}

/** Which infrastructure slots the deployment fills; none when the manifest
 *  names no roster. */
export function getConfiguredSlots(
  source: PlumixManifest = currentManifest(),
): ConfiguredSlots {
  return source.configuredSlots ?? configuredSlotsOf({});
}

/** The admin areas the deployment refuses; none when the manifest names
 *  none. */
export function getRefusedAdminAreas(
  source: PlumixManifest = currentManifest(),
): readonly AdminArea[] {
  return source.refusedAdminAreas ?? [];
}

/** Whether the site keeps core's author routes; on when the manifest is
 *  silent, as it is for a site that never set `routes`. */
export function hasAuthorRoutes(
  source: PlumixManifest = currentManifest(),
): boolean {
  return source.frameworkRoutes?.author ?? true;
}

export function getPatterns(
  source: PlumixManifest = currentManifest(),
): readonly PatternManifestEntry[] {
  return source.patterns ?? [];
}

export function findEntryTypeBySlug(
  slug: string,
  source: PlumixManifest = currentManifest(),
): EntryTypeManifestEntry | undefined {
  return (source.entryTypes ?? []).find((pt) => pt.adminSlug === slug);
}

export function findEntryTypeByName(
  name: string,
  source: PlumixManifest = currentManifest(),
): EntryTypeManifestEntry | undefined {
  return (source.entryTypes ?? []).find((pt) => pt.name === name);
}

/** Empty when the type has none or is unknown. */
export function namedTemplatesForType(
  name: string,
  source: PlumixManifest = currentManifest(),
): readonly NamedTemplateChoice[] {
  return findEntryTypeByName(name, source)?.namedTemplates ?? [];
}

/** Empty when the type declares no selectable space or is unknown. */
export function accessPoliciesForType(
  name: string,
  source: PlumixManifest = currentManifest(),
): readonly AccessPolicyChoice[] {
  return findEntryTypeByName(name, source)?.accessPolicies ?? [];
}

export function visibleEntryTypes(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly EntryTypeManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.entryTypes ?? []).filter((pt) => {
    // A type that opted out of the sidebar isn't a generic content surface
    // either.
    if (!pt.showInSidebar) return false;
    return caps.has(entryTypeCapability(pt, "edit_own"));
  });
}

/**
 * Names of the entry types with a public URL surface — the universe the
 * link field's internal-entry picker searches (only public entries
 * resolve to a permalink worth storing).
 */
export function publicEntryTypeNames(
  source: PlumixManifest = currentManifest(),
): readonly string[] {
  return (source.entryTypes ?? [])
    .filter((pt) => pt.isPublic)
    .map((pt) => pt.name);
}

export function findTermTaxonomyByName(
  name: string,
  source: PlumixManifest = currentManifest(),
): TermTaxonomyManifestEntry | undefined {
  return (source.termTaxonomies ?? []).find((tax) => tax.name === name);
}

export function visibleTermTaxonomies(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly TermTaxonomyManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.termTaxonomies ?? []).filter((tax) =>
    caps.has(termTaxonomyCapability(tax, "read")),
  );
}

export function visibleSettingsPages(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly SettingsPageManifestEntry[] {
  if (!capabilities.includes("settings:manage")) return [];
  return source.settingsPages ?? [];
}

export function visibleDashboardWidgets(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly DashboardWidgetManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.dashboardWidgets ?? []).filter(
    (w) => !w.capability || caps.has(w.capability),
  );
}

// Three meta-box visibility filters (entry/term/user) share the same
// shape: scope filter → capability gate → priority sort. Extracted so
// each surface only declares what's specific (the scope predicate).
function filterMetaBoxes<
  T extends {
    readonly id: string;
    readonly capability?: string;
    readonly priority?: number;
    readonly fields: readonly { readonly capability?: string }[];
  },
>(
  boxes: readonly T[] | undefined,
  caps: Set<string>,
  scopeMatches: (box: T) => boolean,
): readonly T[] {
  return (boxes ?? [])
    .filter((box) => {
      if (!scopeMatches(box)) return false;
      if (box.capability !== undefined && !caps.has(box.capability))
        return false;
      return true;
    })
    .map((box) => ({
      ...box,
      fields: box.fields.filter(
        (field) => field.capability === undefined || caps.has(field.capability),
      ),
    }))
    .sort(byPriorityThen((b) => b.id));
}

export function entryMetaBoxesForType(
  entryTypeName: string,
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly EntryMetaBoxManifestEntry[] {
  return filterMetaBoxes(source.entryMetaBoxes, new Set(capabilities), (box) =>
    box.entryTypes.includes(entryTypeName),
  );
}

export function termMetaBoxesForTermTaxonomy(
  taxonomyName: string,
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly TermMetaBoxManifestEntry[] {
  return filterMetaBoxes(source.termMetaBoxes, new Set(capabilities), (box) =>
    box.termTaxonomies.includes(taxonomyName),
  );
}

export function visibleUserMetaBoxes(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly UserMetaBoxManifestEntry[] {
  return filterMetaBoxes(
    source.userMetaBoxes,
    new Set(capabilities),
    () => true,
  );
}

export function findSettingsPageByName(
  name: string,
  source: PlumixManifest = currentManifest(),
): SettingsPageManifestEntry | undefined {
  return (source.settingsPages ?? []).find((p) => p.name === name);
}

export function findSettingsGroupByName(
  name: string,
  source: PlumixManifest = currentManifest(),
): SettingsGroupManifestEntry | undefined {
  return (source.settingsGroups ?? []).find((g) => g.name === name);
}

export function groupsForSettingsPage(
  page: SettingsPageManifestEntry,
  source: PlumixManifest = currentManifest(),
): readonly SettingsGroupManifestEntry[] {
  return page.groups
    .map((name) => findSettingsGroupByName(name, source))
    .filter((g): g is SettingsGroupManifestEntry => g !== undefined);
}

/** Drops groups left empty. Ordering comes from the wire payload. */
export function visibleAdminNav(
  capabilities: readonly string[],
  source: PlumixManifest = currentManifest(),
): readonly AdminNavGroup[] {
  const caps = new Set(capabilities);
  return (source.adminNav ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.capability || caps.has(item.capability),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Look up the plugin component a `/p/<path>` URL should render. Walks
 * `manifest.adminNav` for a matching `to` and returns its `component`
 * ref — the catch-all route uses this to resolve plugin pages.
 */
export function findPluginPageByPath(
  to: string,
  source: PlumixManifest = currentManifest(),
): AdminNavItem | undefined {
  for (const group of source.adminNav ?? []) {
    for (const item of group.items) {
      if (item.to === to && item.component) return item;
    }
  }
  return undefined;
}
