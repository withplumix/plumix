import { entryTag } from "plumix";

import { shortDigest } from "./digest.js";

/**
 * What a card's `key` callback returns: the identity that reaches the URL and
 * the tag a purge names it by. Emitted together by the {@link cardKey} helpers
 * so the two cannot drift — a card keyed on an entry is tagged for that entry,
 * and there is no second place to keep them in step.
 */
export interface CardKey {
  /** Identity within the site, carried in the card's URL. */
  readonly hash: string;
  /**
   * What a purge of this card names. Core's raw-route cache entries carry no
   * tags yet, so nothing reads this until the edge wiring lands (#1966); the
   * helpers emit it now so a card written today is already purgeable then.
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
   * Name a card by its inputs — `cardKey.of("home", ctx.locale.code)`. Every
   * part is folded into both the hash and the tag, so two pages that read
   * different things cannot collide on one card.
   */
  of: (...parts: readonly (string | number)[]): CardKey => {
    const slug = joinParts(parts);
    return { hash: slug, tag: `og:${slug}` };
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
    hash: joinParts([
      `entry-${String(entry.id)}`,
      entry.updatedAt.getTime(),
      ...parts,
    ]),
    tag: entryTag(entry.id),
  }),
};

export interface CardStorageKeyParts {
  /** Names the card within the site — `entry/12`. */
  readonly target: string;
  /** The card's own identity, from its `key` callback. */
  readonly hash: string;
  /** The card's source, so a redesign lands on a fresh key. */
  readonly sourceHash: string;
  /** The theme's token sheet, so a retuned palette lands on a fresh key. */
  readonly tokens: readonly string[];
  /** Asset-layer paths, not bytes — a swapped font file lands on a new path. */
  readonly fonts: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Stands in for the output format, which it names one-to-one. */
  readonly extension: string;
}

/**
 * The storage key for one card, addressed over what the card read, what the
 * card is, and the size and format it is rendered at — so an edit lands on a
 * fresh key and the ETag the read-through derives from it moves too. The
 * renderer's own identity is not in here: two implementations declaring the
 * same content type share keys, so swapping between them serves what the
 * previous one stored.
 */
export async function cardStorageKey(
  parts: CardStorageKeyParts,
): Promise<string> {
  const { target, ...inputs } = parts;
  const digest = await shortDigest(JSON.stringify(inputs));
  return `og/${target}/${digest}.${parts.extension}`;
}

// Parts join on a pair, which `slugify` collapses out of any single part — so
// `of("a-b", "c")` and `of("a", "b-c")` cannot land on one key.
function joinParts(parts: readonly (string | number)[]): string {
  return parts.map((part) => slugify(String(part))).join("--");
}

// A key part reaches a URL path and a cache tag, so it is reduced to the
// characters both accept rather than escaped for each. A part carries entry
// content, so the trim matches one dash rather than a run: the collapse above
// leaves no run for it to find, and `-+$` would backtrack across a title made
// of separators.
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}
