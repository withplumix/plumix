import type { HookRegistry } from "../hooks/registry.js";
import { tryGetContext } from "../context/stores.js";
import { bumpSitemapVersion } from "./sitemap-cache.js";

// Lifecycle actions whose payloads can change which URLs belong in a sitemap.
// Firing any of them retires every cached sub-sitemap by bumping the version.
const ENTITY_ACTIONS = [
  "entry:published",
  "entry:updated",
  "entry:trashed",
  "entry:restored",
  "entry:deleted",
  "term:created",
  "term:updated",
  "term:deleted",
  "term:meta_changed",
] as const;

// Subscribers get no context argument, so they resolve the per-request
// `AppContext` from the request store; a fire outside a request frame is a
// silent no-op.
function bump(): Promise<void> | void {
  const ctx = tryGetContext();
  if (!ctx) return;
  return bumpSitemapVersion(ctx);
}

/**
 * Register core's sitemap cache-busting subscribers. Called at app boot
 * alongside the other core hook registrations.
 */
export function registerCoreSitemapInvalidator(hooks: HookRegistry): void {
  for (const action of ENTITY_ACTIONS) {
    hooks.addAction(action as never, bump);
  }
  // A site-privacy toggle changes which URLs (if any) the sitemap may expose;
  // the gate lives inside the cached generator, so the cache must be retired
  // when the `site` group changes for it to take effect. Other settings groups
  // don't affect sitemap output — skip them to avoid needless invalidation.
  hooks.addAction("settings:group_changed", (changes) => {
    if (changes.group !== "site") return;
    return bump();
  });
}
