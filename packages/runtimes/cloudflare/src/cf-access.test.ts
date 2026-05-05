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

describe("cfAccess — config validation", () => {
  test.each([
    ["bare domain", "example.com"],
    ["protocol-prefixed", "https://yourteam.cloudflareaccess.com"],
    ["with path", "yourteam.cloudflareaccess.com/path"],
    ["wrong suffix", "yourteam.cloudflare.com"],
    ["empty", ""],
    ["uppercase", "YOURTEAM.cloudflareaccess.com"],
  ])("rejects malformed teamDomain (%s)", (_name, teamDomain) => {
    expect(() =>
      cfAccess({ teamDomain, audience: AUDIENCE, defaultRole: "editor" }),
    ).toThrow(/teamDomain/);
  });

  test("rejects empty audience (would silently bypass per-app binding)", () => {
    expect(() =>
      cfAccess({
        teamDomain: TEAM_DOMAIN,
        audience: "",
        defaultRole: "editor",
      }),
    ).toThrow(/audience/);
  });

  test("accepts a valid teamDomain + audience pair", () => {
    expect(() =>
      cfAccess({
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE,
        defaultRole: "editor",
      }),
    ).not.toThrow();
  });
});

describe("cfAccess — signOutUrl", () => {
  test("returns the team's CF Access logout endpoint", () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    expect(guard.signOutUrl?.()).toBe(
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

  // Vitest's default 5s timeout flakes intermittently on shared CI
  // runners — the test exercises a real WebCrypto JWK sign + verify
  // round-trip plus an in-memory libsql migration, both of which can
  // exceed 5s under runner contention. Locally completes in ~1.7s.
  test(
    "provisions and returns the user when the JWT is valid",
    { timeout: 30_000 },
    async () => {
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

      const result = await guard.authenticate(
        new Request("https://cms.example/", {
          headers: { "cf-access-jwt-assertion": jwt },
        }),
        db,
      );
      expect(result).not.toBeNull();
      expect(result?.user.email).toBe("first-admin@enterprise.example");
      // bootstrapAllowed=true on a zero-user system → first user is admin.
      expect(result?.user.role).toBe("admin");
    },
  );

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

  test("JWKS is fetched once across many authenticate calls (cache contract)", async () => {
    const { createTestDb } = await import("@plumix/core/test");
    const db = await createTestDb();

    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      bootstrapAllowed: true,
    });

    for (let i = 0; i < 5; i++) {
      const jwt = await mintJwt(material.privateKey, material.kid, {
        email: `user-${i}@enterprise.example`,
      });
      await guard.authenticate(
        new Request("https://cms.example/", {
          headers: { "cf-access-jwt-assertion": jwt },
        }),
        db,
      );
    }

    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const jwksFetches = fetchSpy.mock.calls.filter((call: unknown[]) => {
      const arg = call[0];
      const url = typeof arg === "string" ? arg : (arg as Request).url;
      return url.includes("/cdn-cgi/access/certs");
    });
    // jose's createRemoteJWKSet caches the keyset per construction, so
    // a single guard instance should hit the JWKS endpoint exactly
    // once across many authenticate calls. Regression here = perf
    // disaster (one round-trip per request).
    expect(jwksFetches).toHaveLength(1);
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
