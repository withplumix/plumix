import type {
  MetaBoxManifestEntry,
  PlumixManifest,
  PostTypeManifestEntry,
} from "@plumix/core/manifest";
import { emptyManifest, MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

// Parse the inline `<script id="plumix-manifest">` payload injected by the
// plumix vite plugin at consumer-build time. Falls back to an empty manifest
// if the tag is missing or malformed so the admin shell still renders
// (useful for `vite dev` inside the admin workspace, where the plugin isn't
// wired and the placeholder ships with `{"postTypes":[]}`).
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
  const postTypes = (value as { postTypes?: unknown }).postTypes;
  const metaBoxes = (value as { metaBoxes?: unknown }).metaBoxes;
  return {
    postTypes: Array.isArray(postTypes) ? postTypes : [],
    metaBoxes: Array.isArray(metaBoxes) ? metaBoxes : [],
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
 * Look up a registered post type by its admin slug (the `/content/$slug`
 * route param). Returns `undefined` when the slug doesn't match anything —
 * the route component should render a 404-style not-found state in that
 * case rather than a blank screen.
 */
export function findPostTypeBySlug(
  slug: string,
  source: PlumixManifest = manifest,
): PostTypeManifestEntry | undefined {
  return source.postTypes.find((pt) => pt.adminSlug === slug);
}

/**
 * Sidebar gate: which post types should show up in the admin nav for a
 * user with the given capability set. Uses the post type's
 * `capabilityType` (or its `name` when unset) to build the capability
 * string and checks for `${capabilityType}:edit_own` — the lowest bar
 * that implies "this user has any business editing this content type".
 * Subscribers (read-only) are intentionally excluded.
 */
export function visiblePostTypes(
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly PostTypeManifestEntry[] {
  const caps = new Set(capabilities);
  return source.postTypes.filter((pt) => {
    const cap = `${pt.capabilityType ?? pt.name}:edit_own`;
    return caps.has(cap);
  });
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
 * post type, honouring each box's optional capability gate. Returned in
 * render order: by `priority` (high → default → low; undefined treated
 * as "default"), with registration order as the stable tiebreaker.
 */
export function metaBoxesForPostType(
  postTypeName: string,
  capabilities: readonly string[],
  source: PlumixManifest = manifest,
): readonly MetaBoxManifestEntry[] {
  const caps = new Set(capabilities);
  const applicable = source.metaBoxes.filter((box) => {
    if (!box.postTypes.includes(postTypeName)) return false;
    if (box.capability !== undefined && !caps.has(box.capability)) return false;
    return true;
  });
  return [...applicable].sort((a, b) => {
    const ap = META_BOX_PRIORITY_WEIGHT[a.priority ?? "default"];
    const bp = META_BOX_PRIORITY_WEIGHT[b.priority ?? "default"];
    return ap - bp;
  });
}
