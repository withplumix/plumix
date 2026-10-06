import type { Db } from "plumix";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { chainAuthenticators, defaultAuthenticator } from "plumix/auth";
import {
  createDispatcherHarness,
  createTestDb,
  plumixRequest,
} from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

  test.each([
    ["empty list", []],
    ["list with an empty entry", ["aud-prod", ""]],
  ])("rejects an audience %s", (_name, audience) => {
    expect(() =>
      cfAccess({ teamDomain: TEAM_DOMAIN, audience, defaultRole: "editor" }),
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
  // Chained beside the default authenticator, the Access logout must only
  // reach a request that carries an Access credential, or a member signed in
  // by magic link would be sent to the Access logout too.
  async function signOutRedirect(cookie: string): Promise<string | null> {
    const h = await createDispatcherHarness({
      config: {
        auth: {
          authenticator: chainAuthenticators(
            defaultAuthenticator(),
            cfAccess({
              teamDomain: TEAM_DOMAIN,
              audience: AUDIENCE,
              defaultRole: "editor",
            }),
          ),
        },
      },
    });
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", {
        method: "POST",
        headers: { cookie },
      }),
    );
    const body = await response.json<{ redirectTo: string | null }>();
    return body.redirectTo;
  }

  test("sends a request carrying CF_Authorization to the Access logout", async () => {
    expect(await signOutRedirect("CF_Authorization=any-token")).toBe(
      `https://${TEAM_DOMAIN}/cdn-cgi/access/logout`,
    );
  });

  test("leaves a request carrying only a Plumix session to its own sign-out", async () => {
    expect(await signOutRedirect("plumix_session=any-token")).toBeNull();
  });

  test("returns the Access logout for a request carrying the Access header", () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const request = new Request("https://cms.example/", {
      headers: { "cf-access-jwt-assertion": "any-token" },
    });
    expect(guard.signOutUrl?.(request)).toBe(
      `https://${TEAM_DOMAIN}/cdn-cgi/access/logout`,
    );
  });
});

describe("cfAccess — hasSession", () => {
  // Regression: CF Access identity rides the `cf-access-jwt-assertion` header,
  // not the standard session cookie. If the guard didn't declare it carries a
  // session, public renders would skip authentication and the visual editor
  // (a capability-gated render) would never boot for a CF Access operator.
  test("carries a session when the CF Access header is present", () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const withHeader = new Request("https://cms.example/post/hello", {
      headers: { "cf-access-jwt-assertion": "any-token" },
    });
    const without = new Request("https://cms.example/post/hello");
    expect(guard.hasSession?.(withHeader)).toBe(true);
    expect(guard.hasSession?.(without)).toBe(false);
  });

  test("carries a session when only the CF_Authorization cookie is present", () => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const withCookie = new Request("https://cms.example/post/hello", {
      headers: { cookie: "CF_Authorization=any-token" },
    });
    const withOtherCookie = new Request("https://cms.example/post/hello", {
      headers: { cookie: "plumix_session=abc" },
    });
    expect(guard.hasSession?.(withCookie)).toBe(true);
    expect(guard.hasSession?.(withOtherCookie)).toBe(false);
  });

  test.each([
    ["an empty value", "CF_Authorization="],
    ["a lookalike name", "not_CF_Authorization=any-token"],
    ["a name that only prefixes it", "CF_Authorization_x=any-token"],
    [
      "a cookie value that holds the name",
      "plumix_session=CF_Authorization=any-token",
    ],
  ])("carries no session for a cookie with %s", (_name, cookie) => {
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
    });
    const request = new Request("https://cms.example/post/hello", {
      headers: { cookie },
    });
    expect(guard.hasSession?.(request)).toBe(false);
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
      { startingUserMeta: {} },
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
      { startingUserMeta: {} },
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
      { startingUserMeta: {} },
    );
    expect(result).toBeNull();
  });

  test("provisions and returns the user when the JWT is valid", async () => {
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
      { startingUserMeta: {} },
    );
    expect(result).not.toBeNull();
    expect(result?.user.email).toBe("first-admin@enterprise.example");
    // bootstrapAllowed=true on a zero-user system → first user is admin.
    expect(result?.user.role).toBe("admin");
    expect(result?.credential).toBe("session");
  });

  // A user CF Access provisions is a new entity, so it stores the starting
  // meta core hands the authenticator (ADR 0026).
  test("a user it provisions stores the starting user meta", async () => {
    const db = await createTestDb();
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      bootstrapAllowed: true,
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      email: "new@enterprise.example",
    });

    const result = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": jwt },
      }),
      db,
      { startingUserMeta: { pronouns: "they/them" } },
    );
    expect(result?.user.meta).toEqual({ pronouns: "they/them" });
  });

  test("returns null when bootstrap is disabled and zero users exist", async () => {
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
      { startingUserMeta: {} },
    );
    expect(user).toBeNull();
  });

  test("JWKS is fetched once across many authenticate calls (cache contract)", async () => {
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
        { startingUserMeta: {} },
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

  // A path-scoped Access app injects the header only on the paths it covers;
  // the admin's RPC calls carry the host-wide `CF_Authorization` cookie instead.
  test("authenticates from the CF_Authorization cookie when the header is absent", async () => {
    const db = await createTestDb();
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      bootstrapAllowed: true,
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      email: "cookie@enterprise.example",
    });

    const result = await guard.authenticate(
      new Request("https://cms.example/_plumix/rpc/entry/list", {
        headers: { cookie: `plumix_locale=en; CF_Authorization=${jwt}` },
      }),
      db,
      { startingUserMeta: {} },
    );
    expect(result?.user.email).toBe("cookie@enterprise.example");
  });

  test("an invalid header does not fall back to a valid cookie", async () => {
    const db = await createTestDb();
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      defaultRole: "editor",
      bootstrapAllowed: true,
    });
    const jwt = await mintJwt(material.privateKey, material.kid, {
      email: "cookie@enterprise.example",
    });

    const result = await guard.authenticate(
      new Request("https://cms.example/_plumix/admin", {
        headers: {
          "cf-access-jwt-assertion": "not-a-real-jwt",
          cookie: `CF_Authorization=${jwt}`,
        },
      }),
      db,
      { startingUserMeta: {} },
    );
    expect(result).toBeNull();
  });

  // Preview and production hostnames usually sit under separate Access apps,
  // each with its own AUD tag.
  test.each([
    ["the first audience", "aud-preview", "alice@enterprise.example"],
    ["the second audience", "aud-prod", "alice@enterprise.example"],
    ["a third audience", "aud-other", null],
  ])("with an audience list, a JWT for %s", async (_name, aud, expected) => {
    const db = await createTestDb();
    const guard = cfAccess({
      teamDomain: TEAM_DOMAIN,
      audience: ["aud-preview", "aud-prod"],
      defaultRole: "editor",
      bootstrapAllowed: true,
    });
    const jwt = await new SignJWT({ email: "alice@enterprise.example" })
      .setProtectedHeader({ alg: "RS256", kid: material.kid })
      .setIssuedAt()
      .setIssuer(`https://${TEAM_DOMAIN}`)
      .setAudience(aud)
      .setExpirationTime("5m")
      .sign(material.privateKey);

    const result = await guard.authenticate(
      new Request("https://cms.example/", {
        headers: { "cf-access-jwt-assertion": jwt },
      }),
      db,
      { startingUserMeta: {} },
    );
    expect(result?.user.email ?? null).toBe(expected);
  });

  test("returns null when the email claim is missing", async () => {
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
      { startingUserMeta: {} },
    );
    expect(user).toBeNull();
  });
});
