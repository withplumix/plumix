import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { PasskeyKeyPair } from "../../test/fixtures/webauthn.js";
import { credentials } from "../../db/schema/credentials.js";
import { users } from "../../db/schema/users.js";
import {
  buildAssertion,
  buildAttestation,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../test/fixtures/webauthn.js";
import { createTestDb } from "../../test/harness.js";
import { finishAuthentication } from "./authenticate.js";
import { issueChallenge } from "./challenges.js";
import { resolvePasskeyConfig } from "./config.js";
import { finishRegistration } from "./register.js";

const config = resolvePasskeyConfig({
  rpName: "Plumix Test",
  rpId: "cms.example.com",
  origin: "https://cms.example.com",
});

interface RegisteredFixture {
  readonly db: Awaited<ReturnType<typeof createTestDb>>;
  readonly keyPair: PasskeyKeyPair;
  readonly credentialId: Uint8Array;
  readonly credentialIdBase64Url: string;
}

async function registerFixtureCredential(): Promise<RegisteredFixture> {
  const db = await createTestDb();
  const [user] = await db
    .insert(users)
    .values({ email: "u@example.com", role: "admin" })
    .returning({ id: users.id });
  if (!user) throw new Error("seed");

  const { challenge } = await issueChallenge(db, 60_000, user.id);
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
  await db.insert(credentials).values({
    id: verified.credentialId,
    userId: user.id,
    publicKey: Buffer.from(verified.publicKey),
    counter: verified.signatureCounter,
    deviceType: "single_device",
    isBackedUp: false,
    transports: [...verified.transports],
  });

  return {
    db,
    keyPair,
    credentialId,
    credentialIdBase64Url: att.credentialIdBase64Url,
  };
}

describe("finishAuthentication", () => {
  test("verifies a valid assertion end-to-end and updates the counter", async () => {
    const fx = await registerFixtureCredential();
    const { challenge } = await issueChallenge(fx.db, 60_000);
    const assertion = buildAssertion({
      keyPair: fx.keyPair,
      rpId: config.rpId,
      origin: config.origin,
      challenge,
      counter: 1,
    });

    const result = await finishAuthentication(fx.db, config, {
      id: fx.credentialIdBase64Url,
      rawId: fx.credentialIdBase64Url,
      type: "public-key",
      response: {
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
      },
    });

    expect(result.newSignatureCounter).toBe(1);
  });

  test("rejects a counter that did not strictly increase (clone defence)", async () => {
    const fx = await registerFixtureCredential();
    // Bump stored counter beyond what the assertion will report.
    await fx.db
      .update(credentials)
      .set({ counter: 5 })
      .where(eq(credentials.id, fx.credentialIdBase64Url));

    const { challenge } = await issueChallenge(fx.db, 60_000);
    const assertion = buildAssertion({
      keyPair: fx.keyPair,
      rpId: config.rpId,
      origin: config.origin,
      challenge,
      counter: 3, // less than stored 5 → replay
    });
    await expect(
      finishAuthentication(fx.db, config, {
        id: fx.credentialIdBase64Url,
        rawId: fx.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature,
        },
      }),
    ).rejects.toMatchObject({ code: "counter_replay" });
  });

  test("rejects an assertion whose origin does not match", async () => {
    const fx = await registerFixtureCredential();
    const { challenge } = await issueChallenge(fx.db, 60_000);
    const assertion = buildAssertion({
      keyPair: fx.keyPair,
      rpId: config.rpId,
      origin: "https://attacker.example",
      challenge,
      counter: 1,
    });
    await expect(
      finishAuthentication(fx.db, config, {
        id: fx.credentialIdBase64Url,
        rawId: fx.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_origin" });
  });

  test("rejects an assertion signed by a different key", async () => {
    const fx = await registerFixtureCredential();
    const { challenge } = await issueChallenge(fx.db, 60_000);
    const wrongKey = generatePasskeyKeyPair();
    const assertion = buildAssertion({
      keyPair: wrongKey,
      rpId: config.rpId,
      origin: config.origin,
      challenge,
      counter: 1,
    });
    await expect(
      finishAuthentication(fx.db, config, {
        id: fx.credentialIdBase64Url,
        rawId: fx.credentialIdBase64Url,
        type: "public-key",
        response: {
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_signature" });
  });
});
