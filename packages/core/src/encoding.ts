const BASE64URL = /^[A-Za-z0-9_-]*$/;

/**
 * Unpadded base64url over `btoa`: `Uint8Array.prototype.toBase64` is missing
 * from Node 24 and older browsers.
 */
export function encodeBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Ignores trailing padding. Throws the `DOMException` `atob` throws on any
 * other character outside the alphabet.
 */
export function decodeBase64url(value: string): Uint8Array<ArrayBuffer> {
  const unpadded = value.replace(/={1,2}$/, "");
  if (!BASE64URL.test(unpadded)) {
    throw new DOMException("Invalid base64url", "InvalidCharacterError");
  }
  const binary = atob(unpadded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lowercase. */
export function encodeHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
