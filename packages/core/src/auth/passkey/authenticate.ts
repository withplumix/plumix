import { eq } from "drizzle-orm";

import type { Db } from "../../context/app-context.js";
import type { Credential } from "../../db/schema/credentials.js";
import type { ResolvedPasskeyConfig } from "./config.js";
import type { AuthenticationOptions, AuthenticationResponse } from "./types.js";
import { credentials } from "../../db/schema/credentials.js";
import { decodeBase64url } from "../../encoding.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";
import { PasskeyError } from "./errors.js";
import { verifyEs256 } from "./es256.js";
import { originAllowed } from "./origin-policy.js";
import {
  parseAuthenticatorData,
  parseClientData,
  rpIdHashMatches,
} from "./parse.js";

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
  let clientDataBytes: Uint8Array<ArrayBuffer>;
  let authenticatorDataBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    clientDataBytes = decodeBase64url(response.response.clientDataJSON);
    authenticatorDataBytes = decodeBase64url(
      response.response.authenticatorData,
    );
    signatureBytes = decodeBase64url(response.response.signature);
  } catch {
    throw PasskeyError.invalidResponse({
      reason: "Malformed base64url in authentication response",
    });
  }

  const clientData = parseClientData(clientDataBytes);
  if (clientData.type !== "webauthn.get") {
    throw PasskeyError.invalidClientData({ expectedType: "get" });
  }

  if (!originAllowed(clientData.origin, config)) {
    throw PasskeyError.invalidOrigin({
      expected: config.origin,
      actual: clientData.origin,
    });
  }

  const authenticatorData = parseAuthenticatorData(authenticatorDataBytes);
  if (!(await rpIdHashMatches(authenticatorData, config.rpId))) {
    throw PasskeyError.invalidRpId();
  }

  const challenge = await consumeChallenge(db, clientData.challenge);
  if (!challenge) throw PasskeyError.challengeNotFound();
  void challenge;

  const credential = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, response.id))
    .get();
  if (!credential) throw PasskeyError.credentialNotFound();
  if (!authenticatorData.userPresent) throw PasskeyError.userPresenceMissing();

  // A stored 0 is an authenticator that hasn't counted. Once it has, the
  // counter must strictly increase (WebAuthn §7.2 step 22): a non-increasing
  // one, a drop back to 0 included, signals a cloned authenticator.
  if (
    credential.counter !== 0 &&
    authenticatorData.signatureCounter <= credential.counter
  ) {
    throw PasskeyError.counterReplay();
  }

  const signedMessage = await assertionSignatureMessage(
    authenticatorDataBytes,
    clientDataBytes,
  );
  const publicKey = ensureUint8Array(credential.publicKey);
  if (!(await verifyEs256(publicKey, signatureBytes, signedMessage))) {
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

/** WebAuthn §7.2 step 20: `authenticatorData ‖ SHA-256(clientDataJSON)`. */
async function assertionSignatureMessage(
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataJSON);
  const message = new Uint8Array(
    authenticatorData.length + clientDataHash.byteLength,
  );
  message.set(authenticatorData);
  message.set(new Uint8Array(clientDataHash), authenticatorData.length);
  return message;
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
