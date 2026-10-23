import { encodeBase64url, encodeHex } from "../encoding.js";

/** 192 bits — comfortably inside the Copenhagen Book's 120–256 band. */
const TOKEN_BYTES = 24;

const ENCODER = new TextEncoder();

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase64url(bytes);
}

/**
 * SHA-256(token), hex-encoded. The DB stores only the hash so a snapshot
 * leak does not yield live tokens. Native WebCrypto on the hot path.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(token));
  return encodeHex(new Uint8Array(digest));
}

/**
 * Constant-time string equality. A length mismatch returns early, which leaks
 * the length but never where the inputs diverge.
 */
export function safeEqual(a: string, b: string): boolean {
  return constantTimeEqual(ENCODER.encode(a), ENCODER.encode(b));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (const [i, byte] of a.entries()) difference |= byte ^ (b[i] ?? 0);
  return difference === 0;
}
