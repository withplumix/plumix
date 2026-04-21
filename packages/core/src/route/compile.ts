import type {
  PluginRegistry,
  RegisteredPostType,
} from "../plugin/manifest.js";
import type { RouteRule } from "./intent.js";

export const AUTO_ROUTE_PRIORITY = 50;
export const DEFAULT_REWRITE_RULE_PRIORITY = 10;

interface CompiledRule extends RouteRule {
  readonly registeredBy: string | null;
}

/**
 * Compile the route map from the plugin registry. Auto-generates single +
 * archive rules for each public post type, appends explicit
 * `addRewriteRule` entries, sorts ascending by priority. Identical raw
 * patterns throw — the error names both offending plugins.
 */
export function compileRouteMap(registry: PluginRegistry): readonly RouteRule[] {
  const rules: CompiledRule[] = [];

  for (const postType of registry.postTypes.values()) {
    if (postType.isPublic === false) continue;
    for (const rule of autoRulesForPostType(postType)) rules.push(rule);
  }

  for (const registered of registry.rewriteRules) {
    rules.push({
      pattern: new URLPattern({ pathname: registered.pattern }),
      rawPattern: registered.pattern,
      intent: registered.intent,
      priority: registered.priority,
      registeredBy: registered.registeredBy,
    });
  }

  assertUniquePatterns(rules);
  rules.sort((a, b) => a.priority - b.priority);
  return rules;
}

function autoRulesForPostType(postType: RegisteredPostType): CompiledRule[] {
  const baseSlug = postType.rewrite?.slug ?? postType.name;
  const archiveSlug = archiveSlugFor(postType, baseSlug);
  const rules: CompiledRule[] = [];

  if (archiveSlug !== null) {
    const pattern = `/${archiveSlug}`;
    rules.push({
      pattern: new URLPattern({ pathname: pattern }),
      rawPattern: pattern,
      intent: { kind: "archive", postType: postType.name },
      priority: AUTO_ROUTE_PRIORITY,
      registeredBy: postType.registeredBy,
    });
  }

  const singlePattern = baseSlug === "" ? "/:slug" : `/${baseSlug}/:slug`;
  rules.push({
    pattern: new URLPattern({ pathname: singlePattern }),
    rawPattern: singlePattern,
    intent: { kind: "single", postType: postType.name },
    priority: AUTO_ROUTE_PRIORITY,
    registeredBy: postType.registeredBy,
  });

  return rules;
}

// Archive slugs need to be a single path segment — slashes would let a
// plugin silently shadow other routes. Empty is reserved (would match
// `front-page`).
const ARCHIVE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function archiveSlugFor(
  postType: RegisteredPostType,
  baseSlug: string,
): string | null {
  const { hasArchive } = postType;
  if (!hasArchive) return null;
  if (typeof hasArchive === "string") {
    if (!ARCHIVE_SLUG_RE.test(hasArchive)) {
      throw new Error(
        `Post type "${postType.name}" has invalid hasArchive "${hasArchive}" — ` +
          `expected a single lowercase kebab-case path segment.`,
      );
    }
    return hasArchive;
  }
  if (baseSlug === "") return null;
  return baseSlug;
}

function assertUniquePatterns(rules: readonly CompiledRule[]): void {
  const first = new Map<string, string | null>();
  for (const rule of rules) {
    const existing = first.get(rule.rawPattern);
    if (existing !== undefined) {
      throw new Error(
        `Rewrite rule "${rule.rawPattern}" is registered twice ` +
          `(by ${formatOwner(existing)} and ${formatOwner(rule.registeredBy)}).`,
      );
    }
    first.set(rule.rawPattern, rule.registeredBy);
  }
}

function formatOwner(plugin: string | null): string {
  return plugin === null ? "core" : `plugin "${plugin}"`;
}
