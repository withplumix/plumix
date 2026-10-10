import { entryTag } from "plumix/db";

/** Build it with the {@link cardKey} helpers so `id` and `tag` cannot drift. */
export interface CardKey {
  /** Folded into the URL's digest, not the URL itself. */
  readonly id: string;
  readonly tag: string;
}

interface KeyedEntry {
  readonly id: number;
  readonly updatedAt: Date;
}

/**
 * Typed key helpers for a card's `key` callback. `of` names a card by whatever
 * it actually reads; `entry` is the one-liner for a card keyed on one entry.
 */
export const cardKey = {
  /** `cardKey.of("front-page", siteTitle)`. Core purges never sweep its tag. */
  of: (...parts: readonly (string | number)[]): CardKey => {
    const slug = joinParts(parts);
    // Core purges can't know what this reads; a changed input is a changed URL.
    return { id: slug, tag: `og:${slug}` };
  },

  /**
   * `updatedAt` holds whole seconds, so also pass the content the card renders:
   * `cardKey.entry(entry, entry.title)`.
   */
  entry: (
    entry: KeyedEntry,
    ...parts: readonly (string | number)[]
  ): CardKey => ({
    id: joinParts([
      `entry-${String(entry.id)}`,
      entry.updatedAt.getTime(),
      ...parts,
    ]),
    tag: entryTag(entry.id),
  }),
};

// Parts join on a pair, which `slugify` collapses out of any single part — so
// `of("a-b", "c")` and `of("a", "b-c")` cannot land on one id.
function joinParts(parts: readonly (string | number)[]): string {
  return parts.map((part) => slugify(String(part))).join("--");
}

// Trims one dash, not a run: the collapse leaves none, and `-+$` would
// backtrack across a title made of separators.
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}
