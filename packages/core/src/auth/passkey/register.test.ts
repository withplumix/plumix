import { describe, expect, test } from "vitest";

import { userFactory } from "../../test/factories.js";
import {
  buildAttestation,
  generatePasskeyKeyPair,
  leadingZeroYKeyPair,
  randomCredentialId,
} from "../../test/fixtures/webauthn.js";
import { createTestDb } from "../../test/harness.js";
import { issueChallenge } from "./challenges.js";
import {
  PASSKEY_DEFAULTS,
  resolvePasskeyConfig,
  resolvePasskeyOrigins,
} from "./config.js";
import { PasskeyError } from "./errors.js";
import { finishRegistration, persistCredential } from "./register.js";

// The ceremony verifies against a resolved config; static origins resolve
// against an empty env unchanged.
const resolved = (input: Parameters<typeof resolvePasskeyConfig>[0]) =>
  resolvePasskeyOrigins(resolvePasskeyConfig(input), {});

const config = resolved({
  rpName: "Plumix Test",
  rpId: "cms.example.com",
  origin: "https://cms.example.com",
});

describe("finishRegistration (positive ceremony with ES256)", () => {
  test("verifies origin, RP-ID, attestation=none, and extracts the SEC1 public key", async () => {
    const db = await createTestDb();
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
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

  test("a Y coordinate with a leading zero byte still round-trips to a well-formed SEC1 key", async () => {
    // ~1/256 of P-256 keys; a bigint round-trip drops the 0x00 lead and
    // a fixed-offset encoder then left-shifts Y, silently storing a
    // corrupted key that bricks the credential at every future login.
    const db = await createTestDb();
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
    const { challenge } = await issueChallenge(db, 60_000, userId);
    const keyPair = leadingZeroYKeyPair();
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
    expect(verified.publicKey[33]).toBe(0);
  });
});

const previewPolicyConfig = resolved({
  rpName: "Plumix Test",
  rpId: "acme.workers.dev",
  origin: "https://app.acme.workers.dev",
  allowedOrigins: ["https://*.acme.workers.dev"],
});

describe("finishRegistration (origin policy)", () => {
  test("accepts a preview-host origin allowed by a subdomain wildcard", async () => {
    const db = await createTestDb();
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
    const { challenge } = await issueChallenge(db, 60_000, userId);
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();

    const att = buildAttestation({
      keyPair,
      // rpId is the account registrable domain; the browser is on a
      // per-branch preview host under it.
      rpId: previewPolicyConfig.rpId,
      origin: "https://feat-x-app.acme.workers.dev",
      challenge,
      credentialId,
    });

    const verified = await finishRegistration(db, previewPolicyConfig, {
      id: att.credentialIdBase64Url,
      rawId: att.credentialIdBase64Url,
      type: "public-key",
      response: {
        clientDataJSON: att.clientDataJSON,
        attestationObject: att.attestationObject,
      },
    });

    expect(verified.publicKey).toEqual(keyPair.publicKeySec1);
  });

  test("still rejects an origin outside the policy", async () => {
    const db = await createTestDb();
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
    const { challenge } = await issueChallenge(db, 60_000, userId);
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const att = buildAttestation({
      keyPair,
      rpId: previewPolicyConfig.rpId,
      origin: "https://evil.com",
      challenge,
      credentialId,
    });

    await expect(
      finishRegistration(db, previewPolicyConfig, {
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
});

describe("finishRegistration (security checks)", () => {
  test("rejects a response whose origin does not match the configured origin", async () => {
    const db = await createTestDb();
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
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
    ).rejects.toMatchObject({
      code: "invalid_origin",
      detail: {
        expected: "https://cms.example.com",
        actual: "https://attacker.example",
      },
    });
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
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
    const verified = {
      credentialId: "dup",
      publicKey: new Uint8Array([0x04, ...new Uint8Array(64)]),
      signatureCounter: 0,
      transports: [] as const,
      userId: null,
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
    const userId = (
      await userFactory.transient({ db }).create({ role: "admin" })
    ).id;
    await persistCredential(db, {
      userId,
      verified: {
        credentialId: "c1",
        publicKey: new Uint8Array([0x04, ...new Uint8Array(64)]),
        signatureCounter: 0,
        transports: [],
        userId: null,
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
          userId: null,
        },
        maxPerUser: 1,
      }),
    ).rejects.toMatchObject({ code: "credential_limit_reached" });
  });
});
