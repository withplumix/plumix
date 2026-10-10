import type { AppContext } from "plumix/plugin";

import { sign, verify } from "./signing.js";

const SECRET = "timing_secret";

// No upper bound: a slow reader is never rejected.
const MIN_FILL_MS = 1000;

/**
 * Fetched by the island from an uncached route, since the edge-cached page
 * can carry nothing per visitor.
 */
export async function issueTimingToken(ctx: AppContext): Promise<string> {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${await sign(ctx, SECRET, issuedAt)}`;
}

/**
 * No token is not fast (no-JavaScript visitors send none); an unsigned
 * token is, and is treated like a filled honeypot.
 */
export async function isImplausiblyFast(
  ctx: AppContext,
  token: string | null,
): Promise<boolean> {
  if (token === null || token.length === 0) return false;

  const parts = token.split(".");
  const [issuedAt, signature] = parts;
  if (parts.length !== 2 || issuedAt === undefined || signature === undefined) {
    return true;
  }
  if (!/^\d+$/.test(issuedAt)) return true;
  if (!(await verify(ctx, SECRET, issuedAt, signature))) return true;
  return Date.now() - Number(issuedAt) < MIN_FILL_MS;
}
