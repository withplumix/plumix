import { describe, expect, test } from "vitest";

import { users } from "../../db/schema/users.js";
import {
  buildAttestation,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../test/fixtures/webauthn.js";
import { createTestDb } from "../../test/harness.js";
import { issueChallenge } from "./challenges.js";
import { PASSKEY_DEFAULTS, resolvePasskeyConfig } from "./config.js";
import { PasskeyError } from "./errors.js";
import { finishRegistration, persistCredential } from "./register.js";

const config = resolvePasskeyConfig({
  rpName: "Plumix Test",
  rpId: "cms.example.com",
  origin: "https://cms.example.com",
});

async function seedUserId(
  db: Awaited<ReturnType<typeof createTestDb>>,
): Promise<number> {
  const [user] = await db
    .insert(users)
    .values({ email: "u@example.com", role: "admin" })
    .returning({ id: users.id });
  if (!user) throw new Error("seed");
  return user.id;
}

describe("finishRegistration (positive ceremony with ES256)", () => {
  test("verifies origin, RP-ID, attestation=none, and extracts the SEC1 public key", async () => {
    const db = await createTestDb();
    const userId = await seedUserId(db);
    const { challenge } = await issueChallenge(db, 60_000, userId);
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();

    const att = buildAttestation({
      keyPair,
      rpId: config.rpId,
      origin: config.origin,
      challenge,
      credentialId,
    });

    const verified = await finishRegistration(db, config, {
      id: att.credentialIdBase64Url,
      rawId: att.credentialIdBase64Url,
      type: "public-key",
      response: {
        clientDataJSON: att.clientDataJSON,
        attestationObject: att.attestationObject,
      },
    });

    expect(verified.publicKey).toEqual(keyPair.publicKeySec1);
    expect(verified.signatureCounter).toBe(0);
  });
});

describe("finishRegistration (security checks)", () => {
  test("rejects a response whose origin does not match the configured origin", async () => {
    const db = await createTestDb();
    const userId = await seedUserId(db);
    const { challenge } = await issueChallenge(db, 60_000, userId);
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const att = buildAttestation({
      keyPair,
      rpId: config.rpId,
      origin: "https://attacker.example",
      challenge,
      credentialId,
    });

    await expect(
      finishRegistration(db, config, {
        id: att.credentialIdBase64Url,
        rawId: att.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: att.clientDataJSON,
          attestationObject: att.attestationObject,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_origin" });
  });

  test("a missing/used challenge stops registration before any crypto runs", async () => {
    const db = await createTestDb();
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const att = buildAttestation({
      keyPair,
      rpId: config.rpId,
      origin: config.origin,
      challenge: "never-issued",
      credentialId,
    });
    await expect(
      finishRegistration(db, config, {
        id: att.credentialIdBase64Url,
        rawId: att.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: att.clientDataJSON,
          attestationObject: att.attestationObject,
        },
      }),
    ).rejects.toBeInstanceOf(PasskeyError);
  });
});

describe("persistCredential", () => {
  test("rejects a duplicate credential id (would silently re-bind otherwise)", async () => {
    const db = await createTestDb();
    const userId = await seedUserId(db);
    const verified = {
      credentialId: "dup",
      publicKey: new Uint8Array([0x04, ...new Uint8Array(64)]),
      signatureCounter: 0,
      transports: [] as const,
    };
    await persistCredential(db, {
      userId,
      verified,
      maxPerUser: PASSKEY_DEFAULTS.maxCredentialsPerUser,
    });
    await expect(
      persistCredential(db, {
        userId,
        verified,
        maxPerUser: PASSKEY_DEFAULTS.maxCredentialsPerUser,
      }),
    ).rejects.toMatchObject({ code: "credential_already_registered" });
  });

  test("enforces the per-user credential limit", async () => {
    const db = await createTestDb();
    const userId = await seedUserId(db);
    await persistCredential(db, {
      userId,
      verified: {
        credentialId: "c1",
        publicKey: new Uint8Array([0x04, ...new Uint8Array(64)]),
        signatureCounter: 0,
        transports: [],
      },
      maxPerUser: 1,
    });
    await expect(
      persistCredential(db, {
        userId,
        verified: {
          credentialId: "c2",
          publicKey: new Uint8Array([0x04, ...new Uint8Array(64)]),
          signatureCounter: 0,
          transports: [],
        },
        maxPerUser: 1,
      }),
    ).rejects.toMatchObject({ code: "credential_limit_reached" });
  });
});
