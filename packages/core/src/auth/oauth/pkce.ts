import { encodeBase64urlNoPadding } from "@oslojs/encoding";

const VERIFIER_BYTES = 32;
const ENCODER = new TextEncoder();

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_BYTES);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

export async function computeS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    ENCODER.encode(verifier),
  );
  return encodeBase64urlNoPadding(new Uint8Array(digest));
}
