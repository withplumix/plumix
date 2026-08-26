import type { CardNode } from "./renderer.js";

/** Hex characters kept from the digest — 64 bits, far past what one site mints. */
const DIGEST_LENGTH = 16;

export interface CardKeyParts {
  /** Names the card within the site — `entry/12`. */
  readonly target: string;
  readonly node: CardNode;
  readonly stylesheets: readonly string[];
  /** Asset-layer paths, not bytes — a swapped font file lands on a new path. */
  readonly fonts: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Stands in for the output format, which it names one-to-one. */
  readonly extension: string;
}

/**
 * The storage key for one card, content-addressed over everything the renderer
 * is handed. An edited title, a restyled template or a changed font set each
 * land on a fresh key, so a stale render is never read back — and the ETag the
 * read-through derives from the key changes with it.
 */
export async function cardKey(parts: CardKeyParts): Promise<string> {
  const { target, ...inputs } = parts;
  const bytes = new TextEncoder().encode(JSON.stringify(inputs));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, DIGEST_LENGTH);
  return `og/${target}/${hex}.${parts.extension}`;
}
