import type { ThemeBreakpoints, ThemeTokens } from "@plumix/blocks";
import type {
  AdminNavGroup,
  AdminNavItem,
  DashboardWidgetManifestEntry,
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  PatternManifestEntry,
  PlumixManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TermMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";
import { byPriorityThen, MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

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

// Only carries through fields that are arrays in the input. Missing
// fields stay undefined; consumers `?? []` at the read site. Non-array
// values for known fields are dropped (silent, not coerced — the
// payload is build-time generated, malformed shape means the build is
// broken upstream).
const KNOWN_ARRAY_FIELDS = [
  "entryTypes",
  "termTaxonomies",
  "entryMetaBoxes",
  "termMetaBoxes",
  "userMetaBoxes",
  "settingsGroups",
  "settingsPages",
  "adminNav",
  "fieldTypes",
  "blocks",
  "marks",
  "patterns",
] as const satisfies readonly (keyof PlumixManifest)[];

function normalize(value: unknown): PlumixManifest {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const result: PlumixManifest = {};
  for (const key of KNOWN_ARRAY_FIELDS) {
    if (Array.isArray(v[key])) {
      (result as Record<string, unknown>)[key] = v[key];
    }
  }
  if (v.tokens && typeof v.tokens === "object") {
    (result as Record<string, unknown>).tokens = v.tokens;
  }
  if (v.i18n && typeof v.i18n === "object") {
    (result as Record<string, unknown>).i18n = v.i18n;
  }
  if (v.pluginI18n && typeof v.pluginI18n === "object") {
    (result as Record<string, unknown>).pluginI18n = v.pluginI18n;
  }
  return result;
}

const manifest: PlumixManifest = readManifest();

export function getThemeTokens(source: PlumixManifest = manifest): ThemeTokens {
  return source.tokens ?? {};
}

export function getThemeBreakpoints(
  source: PlumixManifest = manifest,
): ThemeBreakpoints {
  return source.breakpoints ?? DEFAULT_BREAKPOINTS;
}

export function getPatterns(
  source: PlumixManifest = manifest,
): readonly PatternManifestEntry[] {
  return source.patterns ?? [];
}

export function findEntryTypeBySlug(
  slug: string,
  source: PlumixManifest = manifest,
): EntryTypeManifestEntry | undefined {
  return (source.entryTypes ?? []).find((pt) => pt.adminSlug === slug);
}

/**
 * Find an entry type by its registered `name` (`"post"`, `"page"`).
 * The lookup adapter emits the row's type name as `LookupResult.
 * targetType`, so the admin reference picker uses this to resolve
 * `labels.untitledItem` from the manifest at render time.
 */
export function findEntryTypeByName(
  name: string,
  source: PlumixManifest = manifest,
): EntryTypeManifestEntry | undefined {
  return (source.entryTypes ?? []).find((pt) => pt.name === name);
}

export function visibleEntryTypes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly EntryTypeManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.entryTypes ?? []).filter((pt) => {
    // `showInSidebar: false` already hides the type from the auto-
    // generated sidebar entry-list link. Apply the same flag to the
    // dashboard quick-card grid — types that opted out of the sidebar
    // weren't meant to be a generic content surface either (e.g. the
    // media plugin renders its own Media Library page).
    if (pt.showInSidebar === false) return false;
    const cap = `entry:${pt.capabilityType ?? pt.name}:edit_own`;
    return caps.has(cap);
  });
}

export function findTermTaxonomyByName(
  name: string,
  source: PlumixManifest = manifest,
): TermTaxonomyManifestEntry | undefined {
  return (source.termTaxonomies ?? []).find((tax) => tax.name === name);
}

export function visibleTermTaxonomies(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly TermTaxonomyManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.termTaxonomies ?? []).filter((tax) =>
    caps.has(`term:${tax.name}:read`),
  );
}

export function visibleSettingsPages(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly SettingsPageManifestEntry[] {
  if (!capabilities.includes("settings:manage")) return [];
  return source.settingsPages ?? [];
}

export function visibleDashboardWidgets(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
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
  source: PlumixManifest = manifest,
): readonly EntryMetaBoxManifestEntry[] {
  return filterMetaBoxes(source.entryMetaBoxes, new Set(capabilities), (box) =>
    box.entryTypes.includes(entryTypeName),
  );
}

export function termMetaBoxesForTermTaxonomy(
  taxonomyName: string,
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly TermMetaBoxManifestEntry[] {
  return filterMetaBoxes(source.termMetaBoxes, new Set(capabilities), (box) =>
    box.termTaxonomies.includes(taxonomyName),
  );
}

export function visibleUserMetaBoxes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly UserMetaBoxManifestEntry[] {
  return filterMetaBoxes(
    source.userMetaBoxes,
    new Set(capabilities),
    () => true,
  );
}

export function findSettingsPageByName(
  name: string,
  source: PlumixManifest = manifest,
): SettingsPageManifestEntry | undefined {
  return (source.settingsPages ?? []).find((p) => p.name === name);
}

export function findSettingsGroupByName(
  name: string,
  source: PlumixManifest = manifest,
): SettingsGroupManifestEntry | undefined {
  return (source.settingsGroups ?? []).find((g) => g.name === name);
}

export function groupsForSettingsPage(
  page: SettingsPageManifestEntry,
  source: PlumixManifest = manifest,
): readonly SettingsGroupManifestEntry[] {
  return page.groups
    .map((name) => findSettingsGroupByName(name, source))
    .filter((g): g is SettingsGroupManifestEntry => g !== undefined);
}

/**
 * Filter the unified admin nav tree by capabilities. Items missing
 * required caps are dropped; groups whose item list ends up empty are
 * dropped too. Group + item ordering is already baked into the wire
 * payload — no re-sort here.
 */
export function visibleAdminNav(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
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
  source: PlumixManifest = manifest,
): AdminNavItem | undefined {
  for (const group of source.adminNav ?? []) {
    for (const item of group.items) {
      if (item.to === to && item.component) return item;
    }
  }
  return undefined;
}
