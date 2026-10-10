import type { PageFacts } from "plumix";
import type { Label } from "plumix/i18n";

/**
 * A registry entry this plugin scopes itself by — an entry type or a taxonomy.
 */
export interface PublicTarget {
  readonly name: string;
  readonly label: Label;
  readonly isPublic: boolean;
}

export function publicTargets<T extends PublicTarget>(
  targets: ReadonlyMap<string, T>,
): T[] {
  return [...targets.values()].filter((target) => target.isPublic);
}

/**
 * False for an access-gated type: a crawler has no session, so even its slugs
 * would leak. Kept apart from {@link publicTargets} so editors still write
 * search copy for it.
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
