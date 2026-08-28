import type { PageFacts } from "plumix";
import type { Label } from "plumix/i18n";

/** A registry entry this plugin scopes itself by — an entry type or a taxonomy. */
export interface PublicTarget {
  readonly name: string;
  readonly label: Label;
  readonly isPublic?: boolean;
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
  return [...targets.values()].filter((target) => target.isPublic !== false);
}

/**
 * The entry type this page answers for: an entry answers for its own, an
 * archive for the type it lists, and every other page kind for none.
 */
export function scopedType(facts: PageFacts): string | null {
  return facts.entry?.type ?? facts.contentType;
}
