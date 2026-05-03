import { describe, expect, test } from "vitest";

import type { PlumixAuthInput } from "./config.js";
import { auth, PlumixConfigError } from "./config.js";

const validPasskey = {
  rpName: "Plumix",
  rpId: "cms.example",
  origin: "https://cms.example",
};

function rejected(input: PlumixAuthInput): PlumixConfigError {
  try {
    auth(input);
  } catch (error) {
    if (error instanceof PlumixConfigError) return error;
    throw error;
  }
  throw new Error("expected auth() to throw PlumixConfigError");
}

describe("auth()", () => {
  test("accepts a minimal valid config", () => {
    const config = auth({ passkey: validPasskey });
    expect(config.kind).toBe("plumix");
    expect(config.passkey).toEqual(validPasskey);
    expect(config.sessions).toBeUndefined();
  });

  test("accepts a config with a full session policy", () => {
    const sessions = {
      maxAgeSeconds: 60,
      absoluteMaxAgeSeconds: 120,
      refreshThreshold: 0.5,
    };
    const config = auth({ passkey: validPasskey, sessions });
    expect(config.sessions).toEqual(sessions);
  });

  test("accepts absoluteMaxAgeSeconds equal to maxAgeSeconds (≥, not >)", () => {
    const sessions = {
      maxAgeSeconds: 120,
      absoluteMaxAgeSeconds: 120,
      refreshThreshold: 0.5,
    };
    expect(() => auth({ passkey: validPasskey, sessions })).not.toThrow();
  });

  test("rejects empty passkey.rpName with a pathed issue", () => {
    const error = rejected({ passkey: { ...validPasskey, rpName: "" } });
    expect(error.issues).toEqual([
      { path: "passkey.rpName", message: "rpName must be a non-empty string" },
    ]);
    expect(error.message).toContain("passkey.rpName");
  });

  test("rejects a non-URL origin", () => {
    const error = rejected({
      passkey: { ...validPasskey, origin: "not-a-url" },
    });
    expect(error.issues[0]?.path).toBe("passkey.origin");
  });

  test("rejects a negative maxAgeSeconds", () => {
    const error = rejected({
      passkey: validPasskey,
      sessions: {
        maxAgeSeconds: -1,
        absoluteMaxAgeSeconds: 120,
        refreshThreshold: 0.5,
      },
    });
    expect(error.issues[0]?.path).toBe("sessions.maxAgeSeconds");
  });

  test("rejects a non-integer maxAgeSeconds", () => {
    const error = rejected({
      passkey: validPasskey,
      sessions: {
        maxAgeSeconds: 1.5,
        absoluteMaxAgeSeconds: 120,
        refreshThreshold: 0.5,
      },
    });
    expect(error.issues[0]?.path).toBe("sessions.maxAgeSeconds");
    expect(error.issues[0]?.message).toContain("integer");
  });

  test("rejects refreshThreshold outside [0, 1]", () => {
    const error = rejected({
      passkey: validPasskey,
      sessions: {
        maxAgeSeconds: 60,
        absoluteMaxAgeSeconds: 120,
        refreshThreshold: 1.5,
      },
    });
    expect(error.issues[0]?.path).toBe("sessions.refreshThreshold");
  });

  test("rejects absoluteMaxAgeSeconds below maxAgeSeconds", () => {
    const error = rejected({
      passkey: validPasskey,
      sessions: {
        maxAgeSeconds: 120,
        absoluteMaxAgeSeconds: 60,
        refreshThreshold: 0.5,
      },
    });
    expect(error.issues[0]?.message).toContain(
      "absoluteMaxAgeSeconds must be ≥ maxAgeSeconds",
    );
  });

  test("collects multiple issues when several fields are wrong", () => {
    const error = rejected({
      passkey: { rpName: "", rpId: "", origin: "bad" },
    });
    const paths = error.issues.map((i) => i.path);
    expect(paths).toContain("passkey.rpName");
  });
});

describe("auth() — oauth schema", () => {
  const stubProvider = {
    label: "Stub",
    authorizeUrl: "https://example.com/authorize",
    tokenUrl: "https://example.com/token",
    userInfoUrl: "https://example.com/userinfo",
    scopes: ["openid"],
    client: { clientId: "id", clientSecret: "secret" },
    parseProfile: () => ({
      providerAccountId: "x",
      email: null,
      emailVerified: false,
      name: null,
      avatarUrl: null,
    }),
  };

  test("accepts a single configured provider", () => {
    const config = auth({
      passkey: validPasskey,
      oauth: { providers: { acme: stubProvider } },
    });
    expect(config.oauth?.providers.acme).toBeDefined();
  });

  test("rejects an empty providers map", () => {
    const error = rejected({
      passkey: validPasskey,
      oauth: { providers: {} },
    });
    expect(error.issues[0]?.message).toMatch(/at least one provider/);
  });

  test("rejects a provider key with invalid characters", () => {
    const error = rejected({
      passkey: validPasskey,
      oauth: { providers: { "Bad-Key!": stubProvider } },
    });
    expect(error.issues[0]?.message).toMatch(/lowercase alphanum/);
  });

  test("rejects a provider with non-URL authorizeUrl", () => {
    const error = rejected({
      passkey: validPasskey,
      oauth: {
        providers: { acme: { ...stubProvider, authorizeUrl: "not-a-url" } },
      },
    });
    expect(error.issues[0]?.message).toMatch(/authorizeUrl/);
  });

  test("rejects a provider missing the parseProfile function", () => {
    const error = rejected({
      passkey: validPasskey,
      oauth: {
        providers: {
          acme: { ...stubProvider, parseProfile: "not-a-function" },
        },
      } as unknown as PlumixAuthInput["oauth"],
    });
    expect(error.issues[0]?.message).toMatch(/parseProfile/);
  });
});

describe("auth() — magicLink schema", () => {
  test("accepts a minimal valid magicLink config", () => {
    const config = auth({
      passkey: validPasskey,
      magicLink: { siteName: "Plumix" },
    });
    expect(config.magicLink?.siteName).toBe("Plumix");
  });

  test("rejects a missing siteName", () => {
    const error = rejected({
      passkey: validPasskey,
      magicLink: {} as unknown as PlumixAuthInput["magicLink"],
    });
    expect(error.issues[0]?.path).toContain("magicLink.siteName");
  });

  test("rejects a siteName with newline (CR/LF defense)", () => {
    const error = rejected({
      passkey: validPasskey,
      magicLink: { siteName: "bad\r\nSubject: x" },
    });
    expect(error.issues[0]?.message).toMatch(/newlines/);
  });

  test("rejects ttlSeconds below 60", () => {
    const error = rejected({
      passkey: validPasskey,
      magicLink: { siteName: "Plumix", ttlSeconds: 30 },
    });
    expect(error.issues[0]?.message).toMatch(/ttlSeconds/);
  });

  test("rejects ttlSeconds above 3600", () => {
    const error = rejected({
      passkey: validPasskey,
      magicLink: { siteName: "Plumix", ttlSeconds: 7200 },
    });
    expect(error.issues[0]?.message).toMatch(/ttlSeconds/);
  });
});

describe("auth() — bootstrapVia", () => {
  test("defaults to undefined (passkey-only bootstrap rail)", () => {
    const config = auth({ passkey: validPasskey });
    expect(config.bootstrapVia).toBeUndefined();
  });

  test('accepts "passkey"', () => {
    const config = auth({ passkey: validPasskey, bootstrapVia: "passkey" });
    expect(config.bootstrapVia).toBe("passkey");
  });

  test('accepts "first-method-wins"', () => {
    const config = auth({
      passkey: validPasskey,
      bootstrapVia: "first-method-wins",
    });
    expect(config.bootstrapVia).toBe("first-method-wins");
  });

  test("rejects an unknown value", () => {
    const error = rejected({
      passkey: validPasskey,
      // @ts-expect-error — exercising runtime validation
      bootstrapVia: "anything-goes",
    });
    expect(error.issues[0]?.path).toBe("bootstrapVia");
  });
});
