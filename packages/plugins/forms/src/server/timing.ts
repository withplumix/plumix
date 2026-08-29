import type { AppContext } from "plumix/plugin";

import { sign, verify } from "./signing.js";

const SECRET = "timing_secret";

/**
 * Under a second between the page issuing a token and the submission
 * arriving is not a person reading a form and answering it. It is the
 * floor a script trips, not a threshold a slow reader can fail: nothing
 * up here rejects a visitor for taking *longer*.
 */
const MIN_FILL_MS = 1000;

/**
 * A signed "the form was on screen from here" mark. The island fetches
 * one after it hydrates, from a route nothing caches — which is the whole
 * reason it is a fetch rather than a hidden input in the rendered form:
 * the page carrying the form is byte-identical for every visitor and
 * edge-cached, so it can carry nothing that is about one of them.
 */
export async function issueTimingToken(ctx: AppContext): Promise<string> {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${await sign(ctx, SECRET, issuedAt)}`;
}

/**
 * Whether a submission carrying `token` was filled implausibly fast.
 *
 * A submission with no token is not fast — that is what a visitor with no
 * JavaScript sends, and the plugin promises them a working form. A token
 * this install did not sign is: nobody legitimate produces one, so it is
 * treated exactly as a filled honeypot is, and the caller files it as
 * spam rather than answering the sender that they were caught.
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
