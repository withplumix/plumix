import { constantTimeEqual } from "@oslojs/crypto/subtle";
import { encodeBase64urlNoPadding, encodeHexLowerCase } from "@oslojs/encoding";

// 192 bits — comfortably inside the Copenhagen Book's 120–256 band.
const TOKEN_BYTES = 24;

const ENCODER = new TextEncoder();

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

/**
 * SHA-256(token), hex-encoded. The DB stores only the hash so a snapshot
 * leak does not yield live tokens. Native WebCrypto on the hot path.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(token));
  return encodeHexLowerCase(new Uint8Array(digest));
}

/** Constant-time string equality — `constantTimeEqual` short-circuits on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  return constantTimeEqual(ENCODER.encode(a), ENCODER.encode(b));
}
