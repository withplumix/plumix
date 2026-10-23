import * as v from "valibot";

import type { JsonValue } from "../../json.js";
import type { CborValue } from "./cbor.js";
import { decodeBase64url, encodeBase64url } from "../../encoding.js";
import { decodeCbor, decodeCborPrefix } from "./cbor.js";
import { PasskeyError } from "./errors.js";

const RP_ID_HASH_LENGTH = 32;
const FLAGS_OFFSET = 32;
const COUNTER_OFFSET = 33;
const HEADER_LENGTH = 37;
const AAGUID_LENGTH = 16;
const CREDENTIAL_ID_LENGTH_SIZE = 2;
const FLAG_USER_PRESENT = 0x01;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

interface ClientData {
  /** Unchecked: each ceremony compares it to the type it expects. */
  readonly type: string;
  /** Unpadded base64url, the form the challenge store keys on. */
  readonly challenge: string;
  readonly origin: string;
}

interface AttestedCredential {
  readonly id: Uint8Array;
  /** The COSE_Key, still undecoded past CBOR. */
  readonly publicKey: CborValue;
}

interface AuthenticatorData {
  readonly rpIdHash: Uint8Array;
  readonly userPresent: boolean;
  readonly signatureCounter: number;
  readonly attestedCredential: AttestedCredential | null;
}

interface AttestationObject {
  readonly format: string;
  readonly authenticatorData: AuthenticatorData;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** Throws `invalid_response` when it isn't client data. */
export function parseClientData(bytes: Uint8Array): ClientData {
  const parsed = v.safeParse(clientDataSchema, decodeJson(bytes));
  if (!parsed.success) throw malformed("client data");
  const { type, challenge, origin } = parsed.output;
  return { type, challenge: normalizeChallenge(challenge), origin };
}

const clientDataSchema = v.object({
  type: v.string(),
  challenge: v.string(),
  origin: v.string(),
});

function decodeJson(bytes: Uint8Array): JsonValue {
  try {
    return JSON.parse(UTF8.decode(bytes)) as JsonValue;
  } catch {
    throw malformed("client data");
  }
}

function normalizeChallenge(challenge: string): string {
  try {
    return encodeBase64url(decodeBase64url(challenge));
  } catch {
    throw malformed("client data challenge");
  }
}

/** Throws `invalid_response` on truncated input. */
export function parseAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
  if (bytes.length < HEADER_LENGTH) {
    throw malformed("authenticator data is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const flags = view.getUint8(FLAGS_OFFSET);
  return {
    rpIdHash: bytes.slice(0, RP_ID_HASH_LENGTH),
    userPresent: (flags & FLAG_USER_PRESENT) !== 0,
    signatureCounter: view.getUint32(COUNTER_OFFSET),
    attestedCredential:
      (flags & FLAG_ATTESTED_CREDENTIAL) === 0
        ? null
        : parseAttestedCredential(bytes, view),
  };
}

function parseAttestedCredential(
  bytes: Uint8Array,
  view: DataView,
): AttestedCredential {
  const lengthOffset = HEADER_LENGTH + AAGUID_LENGTH;
  const idStart = lengthOffset + CREDENTIAL_ID_LENGTH_SIZE;
  if (bytes.length < idStart) {
    throw malformed("attested credential data is truncated");
  }
  // An id past the end leaves no bytes for the key, which CBOR then refuses.
  const idEnd = idStart + view.getUint16(lengthOffset);
  const { value } = decodeCborPrefix(bytes.subarray(idEnd));
  return { id: bytes.slice(idStart, idEnd), publicKey: value };
}

export async function rpIdHashMatches(
  data: AuthenticatorData,
  rpId: string,
): Promise<boolean> {
  const expected = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
  );
  return expected.every((byte, i) => byte === data.rpIdHash[i]);
}

/** Throws `invalid_response` when it isn't one. */
export function parseAttestationObject(bytes: Uint8Array): AttestationObject {
  const object = decodeCbor(bytes);
  if (!(object instanceof Map)) throw malformed("attestation object");
  const format: unknown = object.get("fmt");
  const authData: unknown = object.get("authData");
  if (typeof format !== "string" || !(authData instanceof Uint8Array)) {
    throw malformed("attestation object");
  }
  return { format, authenticatorData: parseAuthenticatorData(authData) };
}

const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_EC2_CRV = -1;
const COSE_EC2_X = -2;
const COSE_EC2_Y = -3;
const COSE_KTY_EC2 = 2;
export const COSE_ALG_ES256 = -7;
const COSE_CRV_P256 = 1;
const P256_COORDINATE_LENGTH = 32;
const SEC1_UNCOMPRESSED = 0x04;

/**
 * The SEC1 uncompressed point (RFC 5480 §2.2) of an ES256 COSE_Key. Throws
 * `unsupported_algorithm` for any other key.
 */
export function parseEs256PublicKey(cose: CborValue): Uint8Array {
  if (!(cose instanceof Map)) throw malformed("credential public key");
  const algorithm: unknown = cose.get(COSE_ALG);
  if (algorithm !== COSE_ALG_ES256) {
    throw PasskeyError.unsupportedAlgorithm({
      reason: `algorithm ${String(algorithm)}`,
    });
  }
  if (cose.get(COSE_KTY) !== COSE_KTY_EC2) {
    throw PasskeyError.unsupportedAlgorithm({
      reason: "Expected EC2 key for ES256",
    });
  }
  if (cose.get(COSE_EC2_CRV) !== COSE_CRV_P256) {
    throw PasskeyError.unsupportedAlgorithm({
      reason: "Expected P-256 curve",
    });
  }
  const point = new Uint8Array(1 + 2 * P256_COORDINATE_LENGTH);
  point[0] = SEC1_UNCOMPRESSED;
  writeCoordinate(point, cose.get(COSE_EC2_X), 1);
  writeCoordinate(point, cose.get(COSE_EC2_Y), 1 + P256_COORDINATE_LENGTH);
  return point;
}

/** Right-aligned, so a coordinate trimmed of leading zero bytes is left-padded. */
function writeCoordinate(
  point: Uint8Array,
  coordinate: unknown,
  offset: number,
): void {
  if (
    !(coordinate instanceof Uint8Array) ||
    coordinate.length > P256_COORDINATE_LENGTH
  ) {
    throw malformed("credential public key");
  }
  point.set(coordinate, offset + P256_COORDINATE_LENGTH - coordinate.length);
}

function malformed(what: string): PasskeyError {
  return PasskeyError.invalidResponse({ reason: `Malformed ${what}` });
}
