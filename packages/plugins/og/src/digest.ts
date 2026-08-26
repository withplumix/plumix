/** Hex characters kept from a digest — 64 bits, far past what one site mints. */
const DIGEST_LENGTH = 16;

/** SHA-256 over a string, truncated to a short URL- and key-safe token. */
export async function shortDigest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, DIGEST_LENGTH);
}
