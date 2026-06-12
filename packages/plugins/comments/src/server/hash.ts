const ENCODER = new TextEncoder();

/** Lowercase-hex encoding of bytes. */
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lowercase-hex SHA-256 of a string, via WebCrypto (Workers + Node). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(input));
  return toHex(new Uint8Array(digest));
}
