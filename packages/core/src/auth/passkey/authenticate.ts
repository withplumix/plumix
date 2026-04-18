import {
  decodePKIXECDSASignature,
  decodeSEC1PublicKey,
  p256,
  verifyECDSASignature,
} from "@oslojs/crypto/ecdsa";
import { sha256 } from "@oslojs/crypto/sha2";
import {
  decodeBase64urlIgnorePadding,
  encodeBase64urlNoPadding,
} from "@oslojs/encoding";
import {
  ClientDataType,
  createAssertionSignatureMessage,
  parseAuthenticatorData,
  parseClientDataJSON,
} from "@oslojs/webauthn";
import { eq } from "drizzle-orm";

import type { Db } from "../../context/app.js";
import type { Credential } from "../../db/schema/credentials.js";
import type { ResolvedPasskeyConfig } from "./config.js";
import type { AuthenticationOptions, AuthenticationResponse } from "./types.js";
import { credentials } from "../../db/schema/credentials.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";
import { PasskeyError } from "./errors.js";

export interface BeginAuthenticationInput {
  readonly allowCredentials?: readonly Credential[];
}

export async function beginAuthentication(
  db: Db,
  config: ResolvedPasskeyConfig,
  input: BeginAuthenticationInput = {},
): Promise<AuthenticationOptions> {
  const { challenge } = await issueChallenge(db, config.challengeTtlMs);
  return {
    challenge,
    rpId: config.rpId,
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: input.allowCredentials?.map((c) => ({
      type: "public-key" as const,
      id: c.id,
      transports: c.transports ?? undefined,
    })),
  };
}

export interface VerifiedAuthentication {
  readonly credential: Credential;
  readonly newSignatureCounter: number;
}

/**
 * Verify an assertion. Order of checks (Copenhagen Book):
 * 1. challenge consumed atomically (no double-spend)
 * 2. clientData type === webauthn.get
 * 3. origin === expected
 * 4. RP-ID hash matches
 * 5. user-present flag set
 * 6. counter strictly greater than stored (replay defence; counter == 0 means
 *    the authenticator does not implement counters — accept once)
 * 7. ECDSA signature verifies over `authenticatorData || sha256(clientDataJSON)`
 */
export async function finishAuthentication(
  db: Db,
  config: ResolvedPasskeyConfig,
  response: AuthenticationResponse,
): Promise<VerifiedAuthentication> {
  let clientDataBytes: Uint8Array;
  let authenticatorDataBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    clientDataBytes = decodeBase64urlIgnorePadding(
      response.response.clientDataJSON,
    );
    authenticatorDataBytes = decodeBase64urlIgnorePadding(
      response.response.authenticatorData,
    );
    signatureBytes = decodeBase64urlIgnorePadding(response.response.signature);
  } catch {
    throw new PasskeyError(
      "invalid_response",
      "Malformed base64url in authentication response",
    );
  }

  const clientData = parseClientDataJSON(clientDataBytes);
  if (clientData.type !== ClientDataType.Get) {
    throw new PasskeyError("invalid_client_data", "Expected webauthn.get");
  }

  if (clientData.origin !== config.origin) {
    throw new PasskeyError("invalid_origin", undefined, {
      expected: config.origin,
      actual: clientData.origin,
    });
  }

  const authenticatorData = parseAuthenticatorData(authenticatorDataBytes);
  if (!authenticatorData.verifyRelyingPartyIdHash(config.rpId)) {
    throw new PasskeyError("invalid_rp_id");
  }

  const challengeString = encodeBase64urlNoPadding(clientData.challenge);
  const challenge = await consumeChallenge(db, challengeString);
  if (!challenge) throw new PasskeyError("challenge_not_found");
  void challenge;

  const credential = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, response.id))
    .get();
  if (!credential) throw new PasskeyError("credential_not_found");
  if (!authenticatorData.userPresent)
    throw new PasskeyError("user_presence_missing");

  // Counter == 0 is "authenticator doesn't track" — accept; otherwise it must
  // strictly increase. A non-increasing counter signals a cloned authenticator.
  if (
    authenticatorData.signatureCounter !== 0 &&
    authenticatorData.signatureCounter <= credential.counter
  ) {
    throw new PasskeyError("counter_replay");
  }

  const signedMessage = createAssertionSignatureMessage(
    authenticatorDataBytes,
    clientDataBytes,
  );
  const messageHash = sha256(signedMessage);
  const publicKey = decodeSEC1PublicKey(
    p256,
    ensureUint8Array(credential.publicKey),
  );
  const signature = decodePKIXECDSASignature(signatureBytes);

  if (!verifyECDSASignature(publicKey, messageHash, signature)) {
    throw new PasskeyError("invalid_signature");
  }

  await db
    .update(credentials)
    .set({
      counter: authenticatorData.signatureCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(credentials.id, credential.id));

  return {
    credential,
    newSignatureCounter: authenticatorData.signatureCounter,
  };
}

// Drivers vary on BLOB representation: better-sqlite3 returns Buffer (a
// Uint8Array subclass — handled by the first branch), libsql/D1 may return
// ArrayBuffer. Normalise to a plain Uint8Array for oslo's SEC1 decoder.
function ensureUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new PasskeyError(
    "invalid_response",
    "Stored public key has unexpected type",
  );
}
