import type { AppContext } from "plumix/plugin";

import { sign, verify } from "./signing.js";

const SECRET = "bind_secret";

// The signed payload names the form as well as the entry, which is what
// makes a token useless anywhere but the form it was minted for: replay
// it against another slug and the signature is over the wrong string.
const payload = (slug: string, entryId: number): string =>
  `${slug}:${String(entryId)}`;

/**
 * The token a bound form carries: the entry it was rendered on, and this
 * install's signature over that entry *and* this form. It goes into the
 * page's markup, which the edge caches — so it is deliberately about the
 * page rather than about a visitor, and two renders of one page produce
 * the same bytes.
 */
export async function signBoundEntry(
  ctx: AppContext,
  slug: string,
  entryId: number,
): Promise<string> {
  const id = String(entryId);
  return `${id}.${await sign(ctx, SECRET, payload(slug, entryId))}`;
}

/**
 * The entry `token` binds `slug` to, or `null` when this install did not
 * sign it for this form. Every other system surveyed carries the bound
 * value in a plain hidden input, where a visitor edits it in devtools and
 * submits against whichever entry they like; here the value and the
 * signature travel together and the value is only ever read back out of
 * one that verifies.
 */
export async function verifyBoundEntry(
  ctx: AppContext,
  slug: string,
  token: string,
): Promise<number | null> {
  // Exactly two parts, and an id that round-trips: a token is one
  // spelling of one entry, so `7`, `007` and `7.<sig>.junk` are not three
  // ways to say the same thing — the two that were never signed are
  // refused rather than quietly normalized to the one that was.
  const parts = token.split(".");
  const [id, signature] = parts;
  if (parts.length !== 2 || id === undefined || signature === undefined) {
    return null;
  }
  const entryId = Number(id);
  if (!Number.isSafeInteger(entryId) || String(entryId) !== id) return null;
  return (await verify(ctx, SECRET, payload(slug, entryId), signature))
    ? entryId
    : null;
}
