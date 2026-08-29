import type { ResolvedCommentsConfig } from "./config.js";
import { resolveConfig } from "./config.js";

/**
 * The install's own configuration, as the theme surface reads it.
 * `PlumixCommentForm` sits in a theme template, which has no plugin
 * context to reach an install's config through — the same bind
 * `@plumix/plugin-forms` solves with its published form registry, and
 * `@plumix/plugin-menu` with a module-scoped location registry.
 *
 * Module scope means one per process rather than one per app, so an
 * install publishes here and the most recent one wins. That is the right
 * answer for a worker, which boots one app per isolate, and it is why only
 * this surface reads it: the submit handler is handed its own install's
 * config and keeps the isolation it has always had.
 */
let published: ResolvedCommentsConfig = resolveConfig({});

export function publishCommentsConfig(config: ResolvedCommentsConfig): void {
  published = config;
}

export function publishedCommentsConfig(): ResolvedCommentsConfig {
  return published;
}
