// Test-only WebAuthn fixture builder. Uses node:crypto to generate a real
// ES256 key pair, build authenticator data + clientDataJSON, sign assertions,
// and CBOR-encode an attestation object with `fmt: "none"`. The output is
// indistinguishable from what a real browser would POST — the same
// finish{Registration,Authentication} verify path runs end-to-end against it.
//
// Not part of the public surface; tests only. node:crypto is fine here
// (tests run on Node).

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { createPrivateKey } from "node:crypto";
import { encodeBase64urlNoPadding } from "@oslojs/encoding";

const ATTESTED_FLAG = 0x40;
const USER_PRESENT_FLAG = 0x01;

const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_EC2_CRV = -1;
const COSE_EC2_X = -2;
const COSE_EC2_Y = -3;
const COSE_KTY_EC2 = 2;
const COSE_ALG_ES256 = -7;
const COSE_CURVE_P256 = 1;

export interface PasskeyKeyPair {
  readonly privateKey: ReturnType<typeof createPrivateKey>;
  readonly publicKeyX: Uint8Array;
  readonly publicKeyY: Uint8Array;
  /** SEC1-uncompressed (0x04 || X || Y), 65 bytes — what we store in DB. */
  readonly publicKeySec1: Uint8Array;
}

export function generatePasskeyKeyPair(): PasskeyKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") {
    throw new Error("EC keypair export missing x/y");
  }
  // JWK drops leading zero bytes from EC coordinates (~1/256 probability
  // per coord for P-256). Left-pad back to 32 bytes so publicKeySec1 is
  // always a well-formed 65-byte uncompressed point.
  const x = padLeft(base64urlToBytes(jwk.x), 32);
  const y = padLeft(base64urlToBytes(jwk.y), 32);
  return {
    privateKey,
    publicKeyX: x,
    publicKeyY: y,
    publicKeySec1: concatBytes(new Uint8Array([0x04]), x, y),
  };
}

function padLeft(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length >= length) return bytes;
  const out = new Uint8Array(length);
  out.set(bytes, length - bytes.length);
  return out;
}

function base64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, false);
  return b;
}

// CBOR encoder — minimal, just what attestation needs.
const TYPE_UINT = 0;
const TYPE_NEG_INT = 1;
const TYPE_BYTES = 2;
const TYPE_TEXT = 3;
const TYPE_MAP = 5;

function cborHead(major: number, value: number): Uint8Array {
  const tag = major << 5;
  if (value < 24) return new Uint8Array([tag | value]);
  if (value < 0x100) return new Uint8Array([tag | 24, value]);
  if (value < 0x10000) {
    const out = new Uint8Array(3);
    out[0] = tag | 25;
    new DataView(out.buffer).setUint16(1, value, false);
    return out;
  }
  if (value < 0x100000000) {
    const out = new Uint8Array(5);
    out[0] = tag | 26;
    new DataView(out.buffer).setUint32(1, value, false);
    return out;
  }
  throw new Error("cbor head value too large");
}

function cborInt(n: number): Uint8Array {
  if (n >= 0) return cborHead(TYPE_UINT, n);
  return cborHead(TYPE_NEG_INT, -1 - n);
}

function cborText(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concatBytes(cborHead(TYPE_TEXT, bytes.length), bytes);
}

function cborBytes(bytes: Uint8Array): Uint8Array {
  return concatBytes(cborHead(TYPE_BYTES, bytes.length), bytes);
}

/** Encode a CBOR map whose entries are pre-encoded (key, value) pairs. */
function cborMap(entries: readonly [Uint8Array, Uint8Array][]): Uint8Array {
  return concatBytes(cborHead(TYPE_MAP, entries.length), ...entries.flat());
}

function encodeCosePublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  return cborMap([
    [cborInt(COSE_KTY), cborInt(COSE_KTY_EC2)],
    [cborInt(COSE_ALG), cborInt(COSE_ALG_ES256)],
    [cborInt(COSE_EC2_CRV), cborInt(COSE_CURVE_P256)],
    [cborInt(COSE_EC2_X), cborBytes(x)],
    [cborInt(COSE_EC2_Y), cborBytes(y)],
  ]);
}

interface BuildAuthenticatorDataInput {
  readonly rpId: string;
  readonly counter: number;
  readonly userVerified?: boolean;
  /** Provide credentialId + COSE-encoded pubkey to set the AT (attested) flag. */
  readonly attested?: {
    readonly credentialId: Uint8Array;
    readonly cosePublicKey: Uint8Array;
  };
}

function buildAuthenticatorData(
  input: BuildAuthenticatorDataInput,
): Uint8Array {
  const rpIdHash = createHash("sha256").update(input.rpId).digest();
  let flags = USER_PRESENT_FLAG;
  if (input.userVerified) flags |= 0x04;
  if (input.attested) flags |= ATTESTED_FLAG;

  const head = concatBytes(
    new Uint8Array(rpIdHash),
    new Uint8Array([flags]),
    u32(input.counter),
  );
  if (!input.attested) return head;

  const aaguid = new Uint8Array(16); // all zeros — fine for "none" attestation
  return concatBytes(
    head,
    aaguid,
    u16(input.attested.credentialId.length),
    input.attested.credentialId,
    input.attested.cosePublicKey,
  );
}

function buildClientDataJSON(
  type: "webauthn.create" | "webauthn.get",
  challenge: string,
  origin: string,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
  );
}

function buildAttestationObjectNone(authData: Uint8Array): Uint8Array {
  return cborMap([
    [cborText("fmt"), cborText("none")],
    [cborText("attStmt"), cborMap([])],
    [cborText("authData"), cborBytes(authData)],
  ]);
}

interface BuildAssertionInput {
  readonly keyPair: PasskeyKeyPair;
  readonly rpId: string;
  readonly origin: string;
  readonly challenge: string;
  readonly counter: number;
}

interface BuiltAssertion {
  readonly clientDataJSON: string;
  readonly authenticatorData: string;
  readonly signature: string;
}

export function buildAssertion(input: BuildAssertionInput): BuiltAssertion {
  const clientDataBytes = buildClientDataJSON(
    "webauthn.get",
    input.challenge,
    input.origin,
  );
  const authData = buildAuthenticatorData({
    rpId: input.rpId,
    counter: input.counter,
  });
  const clientDataHash = createHash("sha256").update(clientDataBytes).digest();
  // The same shape `createAssertionSignatureMessage` produces on the server.
  const message = concatBytes(authData, new Uint8Array(clientDataHash));
  // Node's sign('sha256', ..., privateKey) emits DER-encoded ECDSA by default.
  const sigDer = sign("sha256", message, input.keyPair.privateKey);
  return {
    clientDataJSON: encodeBase64urlNoPadding(clientDataBytes),
    authenticatorData: encodeBase64urlNoPadding(authData),
    signature: encodeBase64urlNoPadding(new Uint8Array(sigDer)),
  };
}

interface BuildAttestationInput {
  readonly keyPair: PasskeyKeyPair;
  readonly rpId: string;
  readonly origin: string;
  readonly challenge: string;
  readonly credentialId: Uint8Array;
  readonly counter?: number;
}

interface BuiltAttestation {
  readonly clientDataJSON: string;
  readonly attestationObject: string;
  readonly credentialIdBase64Url: string;
}

export function buildAttestation(
  input: BuildAttestationInput,
): BuiltAttestation {
  const cose = encodeCosePublicKey(
    input.keyPair.publicKeyX,
    input.keyPair.publicKeyY,
  );
  const authData = buildAuthenticatorData({
    rpId: input.rpId,
    counter: input.counter ?? 0,
    attested: { credentialId: input.credentialId, cosePublicKey: cose },
  });
  const attObject = buildAttestationObjectNone(authData);
  const clientDataBytes = buildClientDataJSON(
    "webauthn.create",
    input.challenge,
    input.origin,
  );
  return {
    clientDataJSON: encodeBase64urlNoPadding(clientDataBytes),
    attestationObject: encodeBase64urlNoPadding(attObject),
    credentialIdBase64Url: encodeBase64urlNoPadding(input.credentialId),
  };
}

export function randomCredentialId(): Uint8Array {
  const out = new Uint8Array(16);
  crypto.getRandomValues(out);
  return out;
}
