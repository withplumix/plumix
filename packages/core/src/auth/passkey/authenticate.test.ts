import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { PasskeyKeyPair } from "../../test/fixtures/webauthn.js";
import { credentials } from "../../db/schema/credentials.js";
import { decodeBase64url, encodeBase64url } from "../../encoding.js";
import { credentialFactory, userFactory } from "../../test/factories.js";
import {
  ASSERTION,
  ASSERTION_FIRST_USE,
  VECTOR_RP,
} from "../../test/fixtures/simplewebauthn.js";
import {
  buildAssertion,
  buildAttestation,
  generatePasskeyKeyPair,
  randomCredentialId,
  seedChallenge,
} from "../../test/fixtures/webauthn.js";
import { createTestDb } from "../../test/harness.js";
import { ensureUint8Array, finishAuthentication } from "./authenticate.js";
import { issueChallenge } from "./challenges.js";
import { resolvePasskeyConfig, resolvePasskeyOrigins } from "./config.js";
import { PasskeyError } from "./errors.js";
import { finishRegistration } from "./register.js";

/**
 * The ceremony verifies against a resolved config; static origins resolve
 * against an empty env unchanged.
 */
const resolved = (input: Parameters<typeof resolvePasskeyConfig>[0]) =>
  resolvePasskeyOrigins(resolvePasskeyConfig(input), {});

const config = resolved({
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
  const user = await userFactory
    .transient({ db })
    .create({ email: "u@example.com", role: "admin" });

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
  await credentialFactory.transient({ db }).create({
    id: verified.credentialId,
    userId: user.id,
    publicKey: Buffer.from(verified.publicKey),
    counter: verified.signatureCounter,
    transports: [...verified.transports],
  });

  return {
    db,
    keyPair,
    credentialId,
    credentialIdBase64Url: att.credentialIdBase64Url,
  };
}

describe("finishAuthentication (origin policy)", () => {
  test("accepts an assertion from a preview host allowed by a subdomain wildcard", async () => {
    const previewPolicyConfig = resolved({
      rpName: "Plumix Test",
      rpId: "acme.workers.dev",
      origin: "https://app.acme.workers.dev",
      allowedOrigins: ["https://*.acme.workers.dev"],
    });

    const db = await createTestDb();
    const user = await userFactory
      .transient({ db })
      .create({ email: "u@example.com", role: "admin" });

    // Enrol on the canonical origin.
    const { challenge: regChallenge } = await issueChallenge(
      db,
      60_000,
      user.id,
    );
    const keyPair = generatePasskeyKeyPair();
    const credentialId = randomCredentialId();
    const att = buildAttestation({
      keyPair,
      rpId: previewPolicyConfig.rpId,
      origin: previewPolicyConfig.origin,
      challenge: regChallenge,
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
    await credentialFactory.transient({ db }).create({
      id: verified.credentialId,
      userId: user.id,
      publicKey: Buffer.from(verified.publicKey),
      counter: verified.signatureCounter,
      transports: [...verified.transports],
    });

    // Assert from a different preview host under the same registrable domain.
    const { challenge } = await issueChallenge(db, 60_000);
    const assertion = buildAssertion({
      keyPair,
      rpId: previewPolicyConfig.rpId,
      origin: "https://feat-x-app.acme.workers.dev",
      challenge,
      counter: 1,
    });

    const result = await finishAuthentication(db, previewPolicyConfig, {
      id: att.credentialIdBase64Url,
      rawId: att.credentialIdBase64Url,
      type: "public-key",
      response: {
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
      },
    });

    expect(result.newSignatureCounter).toBe(1);
  });
});

// Recorded responses from SimpleWebAuthn's server test suite (MIT); see the
// fixture for the source.
describe("finishAuthentication (published SimpleWebAuthn vectors)", () => {
  const vectorConfig = resolved(VECTOR_RP);

  test.each([
    ["a counting authenticator", ASSERTION],
    ["an authenticator that keeps no counter", ASSERTION_FIRST_USE],
  ])("verifies a real ES256 assertion from %s", async (_, vector) => {
    const db = await createTestDb();
    const user = await userFactory.transient({ db }).create({ role: "admin" });
    await credentialFactory.transient({ db }).create({
      id: vector.response.id,
      userId: user.id,
      publicKey: Buffer.from(vector.publicKeySec1Hex, "hex"),
      counter: vector.storedCounter,
    });
    await seedChallenge(db, vector.challenge);

    const result = await finishAuthentication(
      db,
      vectorConfig,
      vector.response,
    );

    expect(result.newSignatureCounter).toBe(vector.newCounter);
  });

  test("refuses truncated authenticator data as a malformed response", async () => {
    const db = await createTestDb();
    await seedChallenge(db, ASSERTION.challenge);
    const { response } = ASSERTION;

    await expect(
      finishAuthentication(db, vectorConfig, {
        ...response,
        response: { ...response.response, authenticatorData: "PdxHEOnA" },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

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

  test("rejects a counter that fell back to 0 after the authenticator counted", async () => {
    const fx = await registerFixtureCredential();
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
      counter: 0,
    });
    await expect(
      finishAuthentication(fx.db, config, {
        id: fx.credentialIdBase64Url,
        rawId: fx.credentialIdBase64Url,
        type: "public-key",
        response: assertion,
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
    ).rejects.toMatchObject({
      code: "invalid_origin",
      detail: {
        expected: "https://cms.example.com",
        actual: "https://attacker.example",
      },
    });
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

describe("finishAuthentication refuses", () => {
  async function assertionFor(rpId: string) {
    const fx = await registerFixtureCredential();
    const { challenge } = await issueChallenge(fx.db, 60_000);
    const assertion = buildAssertion({
      keyPair: fx.keyPair,
      rpId,
      origin: config.origin,
      challenge,
      counter: 1,
    });
    return {
      db: fx.db,
      response: {
        id: fx.credentialIdBase64Url,
        rawId: fx.credentialIdBase64Url,
        type: "public-key" as const,
        response: assertion,
      },
    };
  }

  test("client data from a registration ceremony", async () => {
    const { db, response } = await assertionFor(config.rpId);
    const clientData = JSON.parse(
      new TextDecoder().decode(
        decodeBase64url(response.response.clientDataJSON),
      ),
    ) as Record<string, unknown>;
    const clientDataJSON = encodeBase64url(
      new TextEncoder().encode(
        JSON.stringify({ ...clientData, type: "webauthn.create" }),
      ),
    );

    await expect(
      finishAuthentication(db, config, {
        ...response,
        response: { ...response.response, clientDataJSON },
      }),
    ).rejects.toMatchObject({ code: "invalid_client_data" });
  });

  test("authenticator data scoped to another RP ID", async () => {
    const { db, response } = await assertionFor("attacker.example");

    await expect(
      finishAuthentication(db, config, response),
    ).rejects.toMatchObject({ code: "invalid_rp_id" });
  });
});

describe("ensureUint8Array", () => {
  test("returns a Uint8Array unchanged", () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(ensureUint8Array(input)).toBe(input);
  });

  test("accepts a Buffer (Uint8Array subclass) unchanged", () => {
    const input = Buffer.from([1, 2, 3]);
    expect(ensureUint8Array(input)).toBe(input);
  });

  test("converts an ArrayBuffer into a view Uint8Array", () => {
    const ab = new ArrayBuffer(3);
    new Uint8Array(ab).set([7, 8, 9]);
    const out = ensureUint8Array(ab);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([7, 8, 9]);
  });

  test("rejects a string-typed public key with credential_storage_corrupt", () => {
    expect(() => ensureUint8Array("not-a-buffer")).toThrow(PasskeyError);
    try {
      ensureUint8Array("not-a-buffer");
    } catch (error) {
      expect((error as PasskeyError).code).toBe("credential_storage_corrupt");
    }
  });

  test("rejects null / undefined / number with credential_storage_corrupt", () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(() => ensureUint8Array(value)).toThrow(
        /credential_storage_corrupt|Stored public key/,
      );
    }
  });
});
