import type { PageFacts } from "plumix";
import type { Label } from "plumix/i18n";

/** A registry entry this plugin scopes itself by — an entry type or a taxonomy. */
export interface PublicTarget {
  readonly name: string;
  readonly label: Label;
  readonly isPublic: boolean;
}

/**
 * Everything publicly visible in one registry, in registration order.
 *
 * Scope is derived rather than configured: a type registered `isPublic: false`
 * — a menu item, a menu group — has no public page to write search copy for,
 * so it is excluded with no configuration.
 */
export function publicTargets<T extends PublicTarget>(
  targets: ReadonlyMap<string, T>,
): T[] {
  return [...targets.values()].filter((target) => target.isPublic);
}

/**
 * Whether a crawler may be told this type exists at all.
 *
 * A crawler carries no session, so a sitemap scope publishes URLs the gate
 * exists to withhold — the slugs alone say what exists — and an IndexNow ping
 * hands over the same URL one entry at a time. Excluded at the type, as
 * `plugin-search` excludes one from its index: the policy resolves per entry,
 * against a principal neither surface has.
 *
 * Deliberately not folded into {@link publicTargets}, which also answers for
 * the editor's meta box, its SERP preview and the per-type settings keys — an
 * editor writes search copy for a gated type, it just never reaches a crawler,
 * and folding it in would orphan values a site had already saved under a type
 * that later gained a policy.
 */
export function isCrawlableType(
  type: { readonly access?: unknown } | undefined,
): boolean {
  return type?.access === undefined;
}

/**
 * The entry type this page answers for: an entry answers for its own, an
 * archive for the type it lists, and every other page kind for none.
 */
export function scopedType(facts: PageFacts): string | null {
  return facts.entry?.type ?? facts.contentType;
}
