import type { AppContext } from "plumix/plugin";

import type { SecretName } from "./secret.js";
import { getOrCreateSecret, getSecret, toHex } from "./secret.js";

const ENCODER = new TextEncoder();

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

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * A hex HMAC of `payload` under this install's secret — itself generated
 * on first use and persisted, so neither token the plugin issues needs
 * configuring.
 */
export async function sign(
  ctx: AppContext,
  secretName: SecretName,
  payload: string,
): Promise<string> {
  const key = await hmacKey(await getOrCreateSecret(ctx, secretName));
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    ENCODER.encode(payload),
  );
  return toHex(new Uint8Array(signature));
}

/**
 * Whether `signature` is one this install produced over `payload`. Reads
 * the secret rather than minting one — see {@link getSecret} — so a
 * caller who presents a token before anything was ever signed is told no
 * rather than writing a row.
 */
export async function verify(
  ctx: AppContext,
  secretName: SecretName,
  payload: string,
  signature: string,
): Promise<boolean> {
  const bytes = fromHex(signature);
  const secret = bytes === null ? null : await getSecret(ctx, secretName);
  if (bytes === null || secret === null) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    bytes,
    ENCODER.encode(payload),
  );
}
