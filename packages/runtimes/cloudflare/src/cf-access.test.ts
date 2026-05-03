import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Db } from "@plumix/core";

import { cfAccess, cfAccessLogoutUrl } from "./cf-access.js";

const TEAM_DOMAIN = "test-team.cloudflareaccess.com";
const AUDIENCE = "00000000000000000000000000000000";

interface KeyMaterial {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly jwks: { keys: unknown[] };
}

async function generateKeyMaterial(): Promise<KeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = "test-kid";
  return {
    kid,
    privateKey,
    jwks: {
      keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }],
    },
  };
}

async function mintJwt(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setIssuer(`https://${TEAM_DOMAIN}`)
    .setAudience(AUDIENCE)
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("cfAccess — signOutUrl", () => {
  test("returns the team's CF Access logout endpoint", () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    expect(guard.signOutUrl?.(new Request("https://cms.example/"))).toBe(
      `https://${TEAM_DOMAIN}/cdn-cgi/access/logout`,
    );
  });
});

describe("cfAccessLogoutUrl", () => {
  test("composes the canonical CF Access logout URL", () => {
    expect(cfAccessLogoutUrl(TEAM_DOMAIN)).toBe(
      `https://${TEAM_DOMAIN}/cdn-cgi/access/logout`,
    );
  });
});

describe("cfAccess.authenticate — header missing or malformed", () => {
  test("returns null when the request has no CF Access header", async () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const result = await guard.authenticate(
      new Request("https://cms.example/"),
      {} as Db,
    );
    expect(result).toBeNull();
  });

  test("returns null when the JWT is malformed (signature can't be parsed)", async () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const result = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": "not-a-real-jwt" },
      }),
      {} as Db,
    );
    expect(result).toBeNull();
  });
});

describe("cfAccess.authenticate — full crypto path", () => {
  let material: KeyMaterial;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    material = await generateKeyMaterial();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
        return Promise.resolve(
          new Response(JSON.stringify(material.jwks), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch in test: ${url}`));
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns null when the JWT was issued for a different audience", async () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    // Mint with a different audience using a low-level SignJWT call.
    const wrongAud = await new SignJWT({ email: "alice@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: material.kid })
      .setIssuedAt()
      .setIssuer(`https://${TEAM_DOMAIN}`)
      .setAudience("different-audience")
      .setExpirationTime("5m")
      .sign(material.privateKey);

    const result = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": wrongAud },
      }),
      {} as Db,
    );
    expect(result).toBeNull();
  });

  test("provisions and returns the user when the JWT is valid", async () => {
    const { createTestDb } = await import("@plumix/core/test");
    const db = await createTestDb();

    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      bootstrapAllowed: true,
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      email: "first-admin@enterprise.example",
    });

    const user = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": jwt },
      }),
      db,
    );
    expect(user).not.toBeNull();
    expect(user?.email).toBe("first-admin@enterprise.example");
    // bootstrapAllowed=true on a zero-user system → first user is admin.
    expect(user?.role).toBe("admin");
  });

  test("returns null when bootstrap is disabled and zero users exist", async () => {
    const { createTestDb } = await import("@plumix/core/test");
    const db = await createTestDb();

    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      // bootstrapAllowed defaults to false → zero users + signup
      // attempt → registration_closed → null.
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      email: "newcomer@enterprise.example",
    });

    const user = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": jwt },
      }),
      db,
    );
    expect(user).toBeNull();
  });

  test("returns null when the email claim is missing", async () => {
    const { createTestDb } = await import("@plumix/core/test");
    const db = await createTestDb();

    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      // no email claim
      sub: "user-123",
    });

    const user = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": jwt },
      }),
      db,
    );
    expect(user).toBeNull();
  });
});
