import { ECDSAPublicKey, p256 } from "@oslojs/crypto/ecdsa";
import {
  decodeBase64urlIgnorePadding,
  encodeBase64urlNoPadding,
} from "@oslojs/encoding";
import {
  AttestationStatementFormat,
  ClientDataType,
  coseAlgorithmES256,
  coseAlgorithmRS256,
  coseEllipticCurveP256,
  COSEKeyType,
  parseAttestationObject,
  parseClientDataJSON,
} from "@oslojs/webauthn";
import { eq } from "drizzle-orm";

import type { Db } from "../../context/app.js";
import type {
  Credential,
  CredentialTransport,
} from "../../db/schema/credentials.js";
import type { ResolvedPasskeyConfig } from "./config.js";
import type { RegistrationOptions, RegistrationResponse } from "./types.js";
import { credentials } from "../../db/schema/credentials.js";
import { consumeChallenge, issueChallenge } from "./challenges.js";
import { PasskeyError } from "./errors.js";

export interface BeginRegistrationInput {
  readonly userId: number;
  readonly userEmail: string;
  readonly userDisplayName?: string;
  readonly excludeCredentials?: readonly Credential[];
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
  );
  const userIdBytes = new TextEncoder().encode(String(input.userId));
  return {
    challenge,
    rp: { name: config.rpName, id: config.rpId },
    user: {
      id: encodeBase64urlNoPadding(userIdBytes),
      name: input.userEmail,
      displayName: input.userDisplayName ?? input.userEmail,
    },
    pubKeyCredParams: [
      // ES256 first — covers Apple, Android, Windows Hello, YubiKey.
      { type: "public-key", alg: coseAlgorithmES256 },
      // Advertise RS256 for older Windows Hello, but reject in verify (v1 = ES256 only).
      { type: "public-key", alg: coseAlgorithmRS256 },
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

export interface VerifiedRegistration {
  readonly credentialId: string;
  /** SEC1-uncompressed P-256 public key, ready for storage. */
  readonly publicKey: Uint8Array;
  readonly signatureCounter: number;
  readonly transports: readonly CredentialTransport[];
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
    clientDataBytes = decodeBase64urlIgnorePadding(
      response.response.clientDataJSON,
    );
    attestationBytes = decodeBase64urlIgnorePadding(
      response.response.attestationObject,
    );
  } catch {
    throw new PasskeyError(
      "invalid_response",
      "Malformed base64url in registration response",
    );
  }

  const clientData = parseClientDataJSON(clientDataBytes);
  if (clientData.type !== ClientDataType.Create) {
    throw new PasskeyError("invalid_client_data", "Expected webauthn.create");
  }

  const challengeString = encodeBase64urlNoPadding(clientData.challenge);
  const challenge = await consumeChallenge(db, challengeString);
  if (!challenge) throw new PasskeyError("challenge_not_found");

  if (clientData.origin !== config.origin) {
    throw new PasskeyError(
      "invalid_origin",
      `Expected origin ${config.origin}, got ${clientData.origin}`,
    );
  }

  const attestation = parseAttestationObject(attestationBytes);
  if (
    attestation.attestationStatement.format !== AttestationStatementFormat.None
  ) {
    // We advertised attestation: "none" — anything else means the authenticator
    // ignored us; we don't verify other formats so we refuse rather than trust.
    throw new PasskeyError("unsupported_attestation_format");
  }

  const { authenticatorData } = attestation;
  if (!authenticatorData.verifyRelyingPartyIdHash(config.rpId)) {
    throw new PasskeyError("invalid_rp_id");
  }
  if (!authenticatorData.userPresent)
    throw new PasskeyError("user_presence_missing");

  if (!authenticatorData.credential) {
    throw new PasskeyError(
      "invalid_response",
      "No credential data in attestation",
    );
  }
  const { credential } = authenticatorData;

  const algorithm = credential.publicKey.algorithm();
  if (algorithm !== coseAlgorithmES256) {
    // RS256 was advertised for compatibility but we deliberately don't
    // implement RSA verify in v1 — ES256 covers ~all real-world authenticators.
    throw new PasskeyError("unsupported_algorithm", `algorithm ${algorithm}`);
  }
  if (credential.publicKey.type() !== COSEKeyType.EC2) {
    throw new PasskeyError(
      "unsupported_algorithm",
      "Expected EC2 key for ES256",
    );
  }
  const cose = credential.publicKey.ec2();
  if (cose.curve !== coseEllipticCurveP256) {
    throw new PasskeyError("unsupported_algorithm", "Expected P-256 curve");
  }
  const publicKey = new ECDSAPublicKey(
    p256,
    cose.x,
    cose.y,
  ).encodeSEC1Uncompressed();

  return {
    credentialId: response.id,
    publicKey,
    signatureCounter: authenticatorData.signatureCounter,
    transports: response.response.transports ?? [],
  };
}

export interface PersistCredentialInput {
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
    throw new PasskeyError("credential_limit_reached");
  }

  const collision = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.id, input.verified.credentialId))
    .get();
  if (collision) throw new PasskeyError("credential_already_registered");

  const [row] = await db
    .insert(credentials)
    .values({
      id: input.verified.credentialId,
      userId: input.userId,
      // Drizzle's `blob({ mode: "buffer" })` types this column as `Buffer`.
      // The cast is only for the type checker — at runtime the libsql / D1
      // driver accepts a Uint8Array (Buffer is a Uint8Array subclass). When
      // the cloudflare adapter lands in Phase 4 we may switch the schema
      // mode so this dance is unnecessary.
      publicKey: input.verified.publicKey as Buffer,
      counter: input.verified.signatureCounter,
      // Backup-eligible flag parsing isn't exposed by @oslojs/webauthn yet;
      // conservative default until it is.
      deviceType: "single_device",
      isBackedUp: false,
      transports: [...input.verified.transports],
      name: input.name ?? null,
    })
    .returning();

  if (!row) throw new Error("persistCredential: insert returned no row");
  return row;
}
