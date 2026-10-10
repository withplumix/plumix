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

import type { Db } from "../../context/app-context.js";
import type { Credential } from "../../db/schema/credentials.js";
import type { ResolvedPasskeyConfig } from "./config.js";
import type { AuthenticationOptions, AuthenticationResponse } from "./types.js";
import { credentials } from "../../db/schema/credentials.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";
import { PasskeyError } from "./errors.js";
import { originAllowed } from "./origin-policy.js";

interface BeginAuthenticationInput {
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

interface VerifiedAuthentication {
  readonly credential: Credential;
  readonly newSignatureCounter: number;
}

/**
 * Spends the challenge before the credential and signature checks, so a failed
 * assertion cannot be retried.
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
    throw PasskeyError.invalidResponse({
      reason: "Malformed base64url in authentication response",
    });
  }

  const clientData = parseClientDataJSON(clientDataBytes);
  if (clientData.type !== ClientDataType.Get) {
    throw PasskeyError.invalidClientData({ expectedType: "get" });
  }

  if (!originAllowed(clientData.origin, config)) {
    throw PasskeyError.invalidOrigin({
      expected: config.origin,
      actual: clientData.origin,
    });
  }

  const authenticatorData = parseAuthenticatorData(authenticatorDataBytes);
  if (!authenticatorData.verifyRelyingPartyIdHash(config.rpId)) {
    throw PasskeyError.invalidRpId();
  }

  const challengeString = encodeBase64urlNoPadding(clientData.challenge);
  const challenge = await consumeChallenge(db, challengeString);
  if (!challenge) throw PasskeyError.challengeNotFound();
  void challenge;

  const credential = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, response.id))
    .get();
  if (!credential) throw PasskeyError.credentialNotFound();
  if (!authenticatorData.userPresent) throw PasskeyError.userPresenceMissing();

  // Counter == 0 is "authenticator doesn't track" — accept; otherwise it must
  // strictly increase. A non-increasing counter signals a cloned authenticator.
  if (
    authenticatorData.signatureCounter !== 0 &&
    authenticatorData.signatureCounter <= credential.counter
  ) {
    throw PasskeyError.counterReplay();
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
    throw PasskeyError.invalidSignature();
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

/**
 * @internal
 *
 * Drivers return BLOBs as `Buffer` or `ArrayBuffer`. Throws
 * `credential_storage_corrupt` on anything else.
 */
export function ensureUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw PasskeyError.credentialStorageCorrupt({
    reason: "Stored public key has unexpected type",
  });
}
