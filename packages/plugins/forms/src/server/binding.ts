import type { AppContext } from "plumix/plugin";

import type { BoundType, FormBound } from "../types.js";
import { BOUND_TYPES } from "../types.js";
import { sign, verify } from "./signing.js";

const SECRET = "bind_secret";

// The slug stops replay against another form; the kind stops entry 7 and
// term 7 sharing a signature.
const payload = (slug: string, bound: FormBound): string =>
  `${slug}:${bound.type}:${String(bound.id)}`;

function isBoundType(value: string): value is BoundType {
  return (BOUND_TYPES as readonly string[]).includes(value);
}

/**
 * Deterministic per page, never per visitor, because it lands in
 * edge-cached markup.
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
 * Null unless this install signed it for this form. Doesn't check whether
 * the form still binds that kind; that is the caller's question.
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
  // `007` is refused, not normalized to the signed `7`.
  const boundId = Number(id);
  if (!Number.isSafeInteger(boundId) || String(boundId) !== id) return null;
  const bound: FormBound = { type, id: boundId };
  return (await verify(ctx, SECRET, payload(slug, bound), signature))
    ? bound
    : null;
}
