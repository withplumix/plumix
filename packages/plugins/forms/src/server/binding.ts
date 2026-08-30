import type { AppContext } from "plumix/plugin";

import type { BoundType, FormBound } from "../types.js";
import { BOUND_TYPES } from "../types.js";
import { sign, verify } from "./signing.js";

const SECRET = "bind_secret";

// The signed payload names the form and the kind as well as the id,
// which is what makes a token useless anywhere but the form it was
// minted for: replay it against another slug and the signature is over
// the wrong string, and the kind is in there because entry 7 and term 7
// are different rows that would otherwise share one signature.
const payload = (slug: string, bound: FormBound): string =>
  `${slug}:${bound.type}:${String(bound.id)}`;

function isBoundType(value: string): value is BoundType {
  return (BOUND_TYPES as readonly string[]).includes(value);
}

/**
 * The token a bound form carries: what it was rendered on, and this
 * install's signature over that *and* this form. It goes into the page's
 * markup, which the edge caches — so it is deliberately about the page
 * rather than about a visitor, and two renders of one page produce the
 * same bytes.
 */
export async function signBound(
  ctx: AppContext,
  slug: string,
  bound: FormBound,
): Promise<string> {
  const signature = await sign(ctx, SECRET, payload(slug, bound));
  return `${bound.type}.${String(bound.id)}.${signature}`;
}

/**
 * What `token` binds `slug` to, or `null` when this install did not sign
 * it for this form. Every other system surveyed carries the
 * bound value in a plain hidden input, where a visitor edits it in
 * devtools and submits against whichever row they like; here the value
 * and the signature travel together and the value is only ever read back
 * out of one that verifies.
 *
 * It answers what was signed, not whether the form still wants it —
 * whether the kind is one this form binds today is the caller's
 * question, because the two have different answers. See `createSubmit`.
 */
export async function verifyBound(
  ctx: AppContext,
  slug: string,
  token: string,
): Promise<FormBound | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [type = "", id = "", signature = ""] = parts;
  if (!isBoundType(type)) return null;
  // An id that round-trips: a token is one spelling of one row, so `7`
  // and `007` are not two ways to say the same thing — the one that was
  // never signed is refused rather than normalized to the one that was.
  const boundId = Number(id);
  if (!Number.isSafeInteger(boundId) || String(boundId) !== id) return null;
  const bound: FormBound = { type, id: boundId };
  return (await verify(ctx, SECRET, payload(slug, bound), signature))
    ? bound
    : null;
}
