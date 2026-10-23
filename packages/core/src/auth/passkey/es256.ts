import { PasskeyError } from "./errors.js";

const DER_SEQUENCE = 0x30;
const DER_INTEGER = 0x02;
const SCALAR_LENGTH = 32;

const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * Verifies a DER `signature` over `message` with a SEC1-encoded P-256 key.
 * Throws `credential_storage_corrupt` when the key isn't a P-256 point.
 */
export async function verifyEs256(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const raw = derSignatureToRaw(signature);
  const key = await importPublicKey(publicKey);
  if (!key) {
    throw PasskeyError.credentialStorageCorrupt({
      reason: "Stored public key is not a P-256 point",
    });
  }
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    raw,
    message,
  );
}

/** Throws `invalid_response` when a registering key isn't a P-256 point. */
export async function assertEs256PublicKey(
  publicKey: Uint8Array,
): Promise<void> {
  if (!(await importPublicKey(publicKey))) {
    throw PasskeyError.invalidResponse({
      reason: "Credential public key is not a P-256 point",
    });
  }
}

async function importPublicKey(
  publicKey: Uint8Array,
): Promise<CryptoKey | null> {
  // Copied: a driver's `Buffer` may sit on a pooled or shared buffer.
  const bytes = new Uint8Array(publicKey);
  try {
    return await crypto.subtle.importKey("raw", bytes, ES256, false, [
      "verify",
    ]);
  } catch {
    return null;
  }
}

/**
 * WebAuthn signs ES256 as a DER `SEQUENCE { r, s }` (RFC 3279 §2.2.3); Web
 * Crypto verifies the fixed-width `r‖s` form. Throws `invalid_response` on
 * anything but a well-formed P-256 signature.
 */
export function derSignatureToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  const reader = new DerReader(der);
  const sequence = reader.element(DER_SEQUENCE);
  reader.assertEnd();

  const body = new DerReader(sequence);
  const raw = new Uint8Array(2 * SCALAR_LENGTH);
  writeScalar(raw, body.element(DER_INTEGER), 0);
  writeScalar(raw, body.element(DER_INTEGER), SCALAR_LENGTH);
  body.assertEnd();
  return raw;
}

function writeScalar(
  raw: Uint8Array,
  integer: Uint8Array,
  offset: number,
): void {
  if (integer.length === 0 || (integer[0] ?? 0) >= 0x80) {
    throw malformed();
  }
  let significant = integer;
  while (significant.length > SCALAR_LENGTH && significant[0] === 0) {
    significant = significant.subarray(1);
  }
  if (significant.length > SCALAR_LENGTH) throw malformed();
  raw.set(significant, offset + SCALAR_LENGTH - significant.length);
}

/** Short-form lengths only: a P-256 signature never needs the long form. */
class DerReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  element(tag: number): Uint8Array {
    const [actualTag, length] = this.bytes.subarray(
      this.offset,
      this.offset + 2,
    );
    if (actualTag !== tag || length === undefined || length >= 0x80) {
      throw malformed();
    }
    const start = this.offset + 2;
    const end = start + length;
    if (end > this.bytes.length) throw malformed();
    this.offset = end;
    return this.bytes.subarray(start, end);
  }

  assertEnd(): void {
    if (this.offset !== this.bytes.length) throw malformed();
  }
}

function malformed(): PasskeyError {
  return PasskeyError.invalidResponse({ reason: "Malformed ES256 signature" });
}
