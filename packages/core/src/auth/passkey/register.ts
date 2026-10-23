import { eq } from "drizzle-orm";

import type { Db } from "../../context/app-context.js";
import type {
  Credential,
  CredentialTransport,
} from "../../db/schema/credentials.js";
import type { RegistrationCeremony } from "./challenges.js";
import type { ResolvedPasskeyConfig } from "./config.js";
import type { RegistrationOptions, RegistrationResponse } from "./types.js";
import { credentials } from "../../db/schema/credentials.js";
import { decodeBase64url, encodeBase64url } from "../../encoding.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";
import { PasskeyError } from "./errors.js";
import { originAllowed } from "./origin-policy.js";
import {
  COSE_ALG_ES256,
  parseAttestationObject,
  parseClientData,
  parseEs256PublicKey,
  rpIdHashMatches,
} from "./parse.js";

const COSE_ALG_RS256 = -257;

interface BeginRegistrationInput {
  readonly userId: number;
  readonly userEmail: string;
  readonly userDisplayName?: string;
  readonly excludeCredentials?: readonly Credential[];
  readonly ceremony: RegistrationCeremony;
}

export async function beginRegistration(
  db: Db,
  config: ResolvedPasskeyConfig,
  input: BeginRegistrationInput,
): Promise<RegistrationOptions> {
  const { challenge } = await issueChallenge(
    db,
    config.challengeTtlMs,
    input.userId,
    input.ceremony,
  );
  const userIdBytes = new TextEncoder().encode(String(input.userId));
  return {
    challenge,
    rp: { name: config.rpName, id: config.rpId },
    user: {
      id: encodeBase64url(userIdBytes),
      name: input.userEmail,
      displayName: input.userDisplayName ?? input.userEmail,
    },
    pubKeyCredParams: [
      // ES256 first — covers Apple, Android, Windows Hello, YubiKey.
      { type: "public-key", alg: COSE_ALG_ES256 },
      // Advertise RS256 for older Windows Hello, but reject in verify (v1 =
      // ES256 only).
      { type: "public-key", alg: COSE_ALG_RS256 },
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: input.excludeCredentials?.map((c) => ({
      type: "public-key" as const,
      id: c.id,
      transports: c.transports ?? undefined,
    })),
  };
}

interface VerifiedRegistration {
  readonly credentialId: string;
  readonly publicKey: Uint8Array;
  readonly signatureCounter: number;
  readonly transports: readonly CredentialTransport[];
  /** Null for discoverable-credential flows. */
  readonly userId: number | null;
  readonly ceremony: RegistrationCeremony | null;
}

/**
 * Verify a registration response and extract the credential. Steps follow
 * the Copenhagen Book ceremony: client data type → challenge → origin →
 * RP-ID hash → user-present → attestation format → algorithm → public key.
 */
export async function finishRegistration(
  db: Db,
  config: ResolvedPasskeyConfig,
  response: RegistrationResponse,
): Promise<VerifiedRegistration> {
  let clientDataBytes: Uint8Array;
  let attestationBytes: Uint8Array;
  try {
    clientDataBytes = decodeBase64url(response.response.clientDataJSON);
    attestationBytes = decodeBase64url(response.response.attestationObject);
  } catch {
    throw PasskeyError.invalidResponse({
      reason: "Malformed base64url in registration response",
    });
  }

  const clientData = parseClientData(clientDataBytes);
  if (clientData.type !== "webauthn.create") {
    throw PasskeyError.invalidClientData({ expectedType: "create" });
  }

  if (!originAllowed(clientData.origin, config)) {
    throw PasskeyError.invalidOrigin({
      expected: config.origin,
      actual: clientData.origin,
    });
  }

  const attestation = parseAttestationObject(attestationBytes);
  if (attestation.format !== "none") {
    throw PasskeyError.unsupportedAttestationFormat({
      format: attestation.format,
    });
  }

  const { authenticatorData } = attestation;
  if (!(await rpIdHashMatches(authenticatorData, config.rpId))) {
    throw PasskeyError.invalidRpId();
  }

  const challenge = await consumeChallenge(db, clientData.challenge);
  if (!challenge) throw PasskeyError.challengeNotFound();
  if (!authenticatorData.userPresent) throw PasskeyError.userPresenceMissing();

  const credential = authenticatorData.attestedCredential;
  if (!credential) {
    throw PasskeyError.invalidResponse({
      reason: "No credential data in attestation",
    });
  }
  // RS256 is advertised for compatibility but refused here: ES256 covers
  // ~all real-world authenticators.
  const publicKey = parseEs256PublicKey(credential.publicKey);

  return {
    credentialId: encodeBase64url(credential.id),
    publicKey,
    signatureCounter: authenticatorData.signatureCounter,
    transports: response.response.transports ?? [],
    userId: challenge.userId,
    ceremony: challenge.ceremony,
  };
}

interface PersistCredentialInput {
  readonly userId: number;
  readonly verified: VerifiedRegistration;
  readonly name?: string;
  readonly maxPerUser: number;
}

/**
 * Persist a verified credential. Enforces the per-user limit and refuses to
 * register the same credential id twice (which would silently re-bind it).
 */
export async function persistCredential(
  db: Db,
  input: PersistCredentialInput,
): Promise<Credential> {
  const userCount = await db.$count(
    credentials,
    eq(credentials.userId, input.userId),
  );
  if (userCount >= input.maxPerUser) {
    throw PasskeyError.credentialLimitReached();
  }

  const collision = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.id, input.verified.credentialId))
    .get();
  if (collision) throw PasskeyError.credentialAlreadyRegistered();

  const [row] = await db
    .insert(credentials)
    .values({
      id: input.verified.credentialId,
      userId: input.userId,
      // Drizzle types the blob column as `Buffer`; the drivers accept a plain
      // Uint8Array at runtime.
      publicKey: input.verified.publicKey as Buffer,
      counter: input.verified.signatureCounter,
      // Backup-eligible flags aren't parsed yet; conservative default until
      // they are.
      deviceType: "single_device",
      isBackedUp: false,
      transports: [...input.verified.transports],
      name: input.name ?? null,
    })
    .returning();

  // eslint-disable-next-line no-restricted-syntax -- unreachable unless the driver returns no row from INSERT … RETURNING
  if (!row) throw new Error("persistCredential: insert returned no row");
  return row;
}
