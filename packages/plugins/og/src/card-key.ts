import { entryTag } from "plumix";

/**
 * What a card's `key` callback returns: what the card read, and the tag a
 * purge names it by. Emitted together by the {@link cardKey} helpers so the
 * two cannot drift — a card keyed on an entry is tagged for that entry, and
 * there is no second place to keep them in step.
 */
export interface CardKey {
  /**
   * What the card read, named. Folded into the digest the URL carries rather
   * than reaching the URL itself, so a card that reads something new lands on
   * a link nothing is holding.
   */
  readonly id: string;
  /**
   * What a purge of this card names. The route stores its edge entry under it,
   * so a card keyed on an entry is swept by the same publish that sweeps that
   * entry's pages.
   */
  readonly tag: string;
}

/** Anything a card can be keyed on, in the shape the helpers read. */
interface KeyedEntry {
  readonly id: number;
  readonly updatedAt: Date;
}

/**
 * Typed key helpers for a card's `key` callback. `of` names a card by whatever
 * it actually reads; `entry` is the one-liner for a card keyed on one entry.
 */
export const cardKey = {
  /**
   * Name a card by its inputs — `cardKey.of("front-page", siteTitle)`. Every
   * part is folded into both the id and the tag, so two pages that read
   * different things cannot collide on one card.
   */
  of: (...parts: readonly (string | number)[]): CardKey => {
    const slug = joinParts(parts);
    // A namespace of its own, because what this card reads is whatever the
    // author named — core's `t:`/`e:` purges cannot know to sweep it. The URL
    // is what invalidates such a card: a changed input is a changed link.
    return { id: slug, tag: `og:${slug}` };
  },

  /**
   * Key a card on one entry, plus anything else it read. `updatedAt` is what
   * makes an edit reach the card — every write through the entry RPC bumps it
   * — but the column holds whole seconds, so a card that renders entry content
   * should name that content too: `cardKey.entry(entry, entry.title)`.
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

// A key part reaches a cache tag, so it is reduced to the characters a tag
// accepts rather than escaped for it. A part carries entry content, so the
// trim matches one dash rather than a run: the collapse above leaves no run
// for it to find, and `-+$` would backtrack across a title made of separators.
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}
