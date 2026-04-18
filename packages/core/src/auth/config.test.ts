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
