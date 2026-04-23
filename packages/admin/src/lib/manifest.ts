import type {
  EntryMetaBoxManifestEntry,
  EntryTypeManifestEntry,
  PlumixManifest,
  SettingsGroupManifestEntry,
  SettingsPageManifestEntry,
  TaxonomyManifestEntry,
  TermMetaBoxManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
import {
  byPriorityThen,
  emptyManifest,
  MANIFEST_SCRIPT_ID,
} from "@plumix/core/manifest";

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
  const entryMetaBoxes = (value as { entryMetaBoxes?: unknown }).entryMetaBoxes;
  const termMetaBoxes = (value as { termMetaBoxes?: unknown }).termMetaBoxes;
  const userMetaBoxes = (value as { userMetaBoxes?: unknown }).userMetaBoxes;
  const settingsGroups = (value as { settingsGroups?: unknown }).settingsGroups;
  const settingsPages = (value as { settingsPages?: unknown }).settingsPages;
  return {
    entryTypes: Array.isArray(entryTypes) ? entryTypes : [],
    taxonomies: Array.isArray(taxonomies) ? taxonomies : [],
    entryMetaBoxes: Array.isArray(entryMetaBoxes) ? entryMetaBoxes : [],
    termMetaBoxes: Array.isArray(termMetaBoxes) ? termMetaBoxes : [],
    userMetaBoxes: Array.isArray(userMetaBoxes) ? userMetaBoxes : [],
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

/**
 * Resolve the set of entry meta boxes the editor should render for a
 * given entry type, honouring each box's optional capability gate.
 * Returned sorted by `priority` ascending with ties broken by `id`
 * alphabetical.
 */
export function entryMetaBoxesForType(
  entryTypeName: string,
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly EntryMetaBoxManifestEntry[] {
  const caps = new Set(capabilities);
  return source.entryMetaBoxes
    .filter((box) => {
      if (!box.entryTypes.includes(entryTypeName)) return false;
      if (box.capability !== undefined && !caps.has(box.capability))
        return false;
      return true;
    })
    .sort(byPriorityThen((b) => b.id));
}

/**
 * Resolve the term meta boxes rendered on the edit form for a given
 * taxonomy. Same capability gate + priority sort as
 * `entryMetaBoxesForType`.
 */
export function termMetaBoxesForTaxonomy(
  taxonomyName: string,
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly TermMetaBoxManifestEntry[] {
  const caps = new Set(capabilities);
  return source.termMetaBoxes
    .filter((box) => {
      if (!box.taxonomies.includes(taxonomyName)) return false;
      if (box.capability !== undefined && !caps.has(box.capability))
        return false;
      return true;
    })
    .sort(byPriorityThen((b) => b.id));
}

/**
 * Resolve the user meta boxes rendered on the user edit form. User
 * meta is a flat keyspace — no scope argument; capability alone gates
 * visibility. Sorted by `priority` with `id` as the tiebreaker.
 *
 * Named to match `visibleEntryTypes` / `visibleTaxonomies` — unlike
 * `entryMetaBoxesForType` / `termMetaBoxesForTaxonomy`, user meta has
 * no scope to filter on.
 */
export function visibleUserMetaBoxes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly UserMetaBoxManifestEntry[] {
  const caps = new Set(capabilities);
  return source.userMetaBoxes
    .filter((box) => box.capability === undefined || caps.has(box.capability))
    .sort(byPriorityThen((b) => b.id));
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
