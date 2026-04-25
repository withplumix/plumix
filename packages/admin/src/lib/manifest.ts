import type {
  AdminNavGroup,
  AdminNavItem,
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  PlumixManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TermMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
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
  "blocks",
  "fieldTypes",
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
  return result;
}

export const manifest: PlumixManifest = readManifest();

export function findEntryTypeBySlug(
  slug: string,
  source: PlumixManifest = manifest,
): EntryTypeManifestEntry | undefined {
  return (source.entryTypes ?? []).find((pt) => pt.adminSlug === slug);
}

export function visibleEntryTypes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly EntryTypeManifestEntry[] {
  const caps = new Set(capabilities);
  return (source.entryTypes ?? []).filter((pt) => {
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

// Three meta-box visibility filters (entry/term/user) share the same
// shape: scope filter → capability gate → priority sort. Extracted so
// each surface only declares what's specific (the scope predicate).
function filterMetaBoxes<
  T extends {
    readonly id: string;
    readonly capability?: string;
    readonly priority?: number;
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
  const caps = new Set(capabilities);
  return (source.userMetaBoxes ?? [])
    .filter((box) => box.capability === undefined || caps.has(box.capability))
    .sort(byPriorityThen((b) => b.id));
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
