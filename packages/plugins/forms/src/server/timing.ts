import type { AppContext } from "plumix/plugin";

import { getOrCreateSecret } from "./secret.js";

const ENCODER = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// `Uint8Array<ArrayBuffer>` rather than the default `ArrayBufferLike`:
// `crypto.subtle.verify` takes a `BufferSource`, which a possibly-shared
// buffer does not satisfy. `null` for anything that is not lowercase hex,
// so a malformed signature is refused before it reaches the verifier.
function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[\da-f]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let at = 0; at < bytes.length; at++) {
    bytes[at] = Number.parseInt(hex.slice(at * 2, at * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Under a second between the page issuing a token and the submission
 * arriving is not a person reading a form and answering it. It is the
 * floor a script trips, not a threshold a slow reader can fail: nothing
 * up here rejects a visitor for taking *longer*.
 */
const MIN_FILL_MS = 1000;

async function timingKey(ctx: AppContext): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(await getOrCreateSecret(ctx, "timing_secret")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * A signed "the form was on screen from here" mark. The island fetches
 * one after it hydrates, from a route nothing caches — which is the whole
 * reason it is a fetch rather than a hidden input in the rendered form:
 * the page carrying the form is byte-identical for every visitor and
 * edge-cached, so it can carry nothing that is about one of them.
 */
export async function issueTimingToken(ctx: AppContext): Promise<string> {
  const issuedAt = Date.now();
  const signature = await crypto.subtle.sign(
    "HMAC",
    await timingKey(ctx),
    ENCODER.encode(String(issuedAt)),
  );
  return `${String(issuedAt)}.${toHex(new Uint8Array(signature))}`;
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

  const [issuedAt, signature] = token.split(".");
  const bytes = signature === undefined ? null : fromHex(signature);
  if (issuedAt === undefined || bytes === null || !/^\d+$/.test(issuedAt)) {
    return true;
  }
  const signed = await crypto.subtle.verify(
    "HMAC",
    await timingKey(ctx),
    bytes,
    ENCODER.encode(issuedAt),
  );
  if (!signed) return true;
  return Date.now() - Number(issuedAt) < MIN_FILL_MS;
}
