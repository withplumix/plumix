import type {
  EntryTypeManifestEntry,
  MetaBoxManifestEntry,
  PlumixManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TaxonomyManifestEntry,
} from "@plumix/core/manifest";
import { emptyManifest, MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

// Parse the inline `<script id="plumix-manifest">` payload injected by the
// plumix vite plugin at consumer-build time. Falls back to an empty manifest
// if the tag is missing or malformed so the admin shell still renders
// (useful for `vite dev` inside the admin workspace, where the plugin isn't
// wired and the placeholder ships with `{"entryTypes":[]}`).
export function readManifest(doc: Document = document): PlumixManifest {
  const el = doc.getElementById(MANIFEST_SCRIPT_ID);
  if (!el) return emptyManifest();
  const text = el.textContent;
  if (text.trim() === "") return emptyManifest();
  try {
    const parsed = JSON.parse(text) as unknown;
    return normalize(parsed);
  } catch {
    // Broken JSON is always a build-pipeline bug. Log loudly in dev and
    // degrade gracefully so the rest of the shell can still render.
    console.error(
      `[plumix] failed to parse #${MANIFEST_SCRIPT_ID} payload; falling back to an empty manifest`,
    );
    return emptyManifest();
  }
}

function normalize(value: unknown): PlumixManifest {
  if (!value || typeof value !== "object") return emptyManifest();
  const entryTypes = (value as { entryTypes?: unknown }).entryTypes;
  const taxonomies = (value as { taxonomies?: unknown }).taxonomies;
  const metaBoxes = (value as { metaBoxes?: unknown }).metaBoxes;
  const settingsGroups = (value as { settingsGroups?: unknown }).settingsGroups;
  const settingsPages = (value as { settingsPages?: unknown }).settingsPages;
  return {
    entryTypes: Array.isArray(entryTypes) ? entryTypes : [],
    taxonomies: Array.isArray(taxonomies) ? taxonomies : [],
    metaBoxes: Array.isArray(metaBoxes) ? metaBoxes : [],
    settingsGroups: Array.isArray(settingsGroups) ? settingsGroups : [],
    settingsPages: Array.isArray(settingsPages) ? settingsPages : [],
  };
}

/**
 * Module-level manifest parsed once at admin-bundle load. The manifest is
 * baked into the HTML at plumix build time and cannot change for the
 * lifetime of the page — no cache / query wrapper needed, anyone who wants
 * it just imports this const.
 *
 * Tests that need a different manifest should call `readManifest(customDoc)`
 * directly rather than mutating this singleton.
 */
export const manifest: PlumixManifest = readManifest();

/**
 * Look up a registered entry type by its admin slug (the `/entries/$slug`
 * route param). Returns `undefined` when the slug doesn't match anything —
 * the route component should render a 404-style not-found state in that
 * case rather than a blank screen.
 */
export function findEntryTypeBySlug(
  slug: string,
  source: PlumixManifest = manifest,
): EntryTypeManifestEntry | undefined {
  return source.entryTypes.find((pt) => pt.adminSlug === slug);
}

/**
 * Sidebar gate: which entry types should show up in the admin nav for a
 * user with the given capability set. Uses the entry type's
 * `capabilityType` (or its `name` when unset) to build the capability
 * string and checks for `${capabilityType}:edit_own` — the lowest bar
 * that implies "this user has any business editing this content type".
 * Subscribers (read-only) are intentionally excluded.
 */
export function visibleEntryTypes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly EntryTypeManifestEntry[] {
  const caps = new Set(capabilities);
  return source.entryTypes.filter((pt) => {
    const cap = `${pt.capabilityType ?? pt.name}:edit_own`;
    return caps.has(cap);
  });
}

/**
 * Look up a registered taxonomy by its name (the `/taxonomies/$name`
 * route param). Returns `undefined` when the name doesn't match — the
 * route component should render a 404-style not-found state.
 */
export function findTaxonomyByName(
  name: string,
  source: PlumixManifest = manifest,
): TaxonomyManifestEntry | undefined {
  return source.taxonomies.find((tax) => tax.name === name);
}

/**
 * Sidebar gate: which taxonomies should show up in the admin nav for a
 * user with the given capability set. Gates on `${taxonomy}:read` —
 * subscribers and above can see a taxonomy if they can read it; edit /
 * delete are gated separately per action inside the route.
 */
export function visibleTaxonomies(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly TaxonomyManifestEntry[] {
  const caps = new Set(capabilities);
  return source.taxonomies.filter((tax) => caps.has(`${tax.name}:read`));
}

// Ordering for meta-box `priority`. Boxes render top-down in the editor
// sidebar; "high" pins above the fold, "low" drops to the bottom. Registry
// insertion order breaks ties (Array.prototype.sort is stable per ES2019).
const META_BOX_PRIORITY_WEIGHT: Record<
  NonNullable<MetaBoxManifestEntry["priority"]>,
  number
> = {
  high: 0,
  default: 1,
  low: 2,
};

/**
 * Resolve the set of meta boxes the editor should render for a given
 * entry type, honouring each box's optional capability gate. Returned in
 * render order: by `priority` (high → default → low; undefined treated
 * as "default"), with registration order as the stable tiebreaker.
 */
export function metaBoxesForEntryType(
  entryTypeName: string,
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly MetaBoxManifestEntry[] {
  const caps = new Set(capabilities);
  // `.filter()` already returns a fresh array, so subsequent `.sort()` is
  // safe to do in place — no need to copy again.
  return source.metaBoxes
    .filter((box) => {
      if (!box.entryTypes.includes(entryTypeName)) return false;
      if (box.capability !== undefined && !caps.has(box.capability))
        return false;
      return true;
    })
    .sort((a, b) => {
      const ap = META_BOX_PRIORITY_WEIGHT[a.priority ?? "default"];
      const bp = META_BOX_PRIORITY_WEIGHT[b.priority ?? "default"];
      return ap - bp;
    });
}

/**
 * Look up a registered settings page by its name (the `/settings/$page`
 * route param). Returns `undefined` when the name doesn't match — the
 * route surfaces a 404-style not-found state in that case.
 */
export function findSettingsPageByName(
  name: string,
  source: PlumixManifest = manifest,
): SettingsPageManifestEntry | undefined {
  return source.settingsPages.find((p) => p.name === name);
}

/**
 * Sidebar gate: which settings pages should render for a user with the
 * given capability set. Gate is `settings:manage` across the board —
 * matches the server's `settings.*` RPC gate. Per-page capability
 * overrides are a future feature.
 */
export function visibleSettingsPages(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly SettingsPageManifestEntry[] {
  if (!capabilities.includes("settings:manage")) return [];
  return source.settingsPages;
}

/**
 * Look up a registered settings group by name. Used by the settings page
 * renderer to resolve each group in `page.groups` into its label,
 * description, and field list.
 */
export function findSettingsGroupByName(
  name: string,
  source: PlumixManifest = manifest,
): SettingsGroupManifestEntry | undefined {
  return source.settingsGroups.find((g) => g.name === name);
}

/**
 * Resolve a page's group references into their registered group entries,
 * skipping any that don't resolve (`buildManifest` already asserts that
 * every reference is valid, so this is belt-and-braces for tests /
 * stale clients).
 */
export function groupsForSettingsPage(
  page: SettingsPageManifestEntry,
  source: PlumixManifest = manifest,
): readonly SettingsGroupManifestEntry[] {
  return page.groups
    .map((name) => findSettingsGroupByName(name, source))
    .filter((g): g is SettingsGroupManifestEntry => g !== undefined);
}
