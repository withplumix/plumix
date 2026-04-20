import type {
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
  return { postTypes: Array.isArray(postTypes) ? postTypes : [] };
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
