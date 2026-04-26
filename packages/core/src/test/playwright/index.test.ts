import { describe, expect, test } from "vitest";

import {
  anonymousSession,
  AUTHED_ADMIN,
  rpcErrorBody,
  rpcOkBody,
  withCapabilities,
} from "./index.js";

describe("anonymousSession", () => {
  test("defaults to needsBootstrap=false (login screen)", () => {
    expect(anonymousSession()).toEqual({ user: null, needsBootstrap: false });
  });

  test("flips to needsBootstrap=true for the first-admin flow", () => {
    expect(anonymousSession(true)).toEqual({
      user: null,
      needsBootstrap: true,
    });
  });
});

describe("withCapabilities", () => {
  test("appends capabilities and returns a fresh object", () => {
    const next = withCapabilities(AUTHED_ADMIN, "media:upload");
    expect(next).not.toBe(AUTHED_ADMIN);
    expect(next.user).not.toBe(AUTHED_ADMIN.user);
    expect(next.user?.capabilities).toContain("media:upload");
    // Original baseline cap still present
    expect(next.user?.capabilities).toContain("settings:manage");
  });

  test("doesn't mutate the input", () => {
    const before = AUTHED_ADMIN.user?.capabilities.length ?? 0;
    withCapabilities(AUTHED_ADMIN, "x");
    expect(AUTHED_ADMIN.user?.capabilities.length).toBe(before);
  });

  test("accepts multiple caps via rest args", () => {
    const next = withCapabilities(AUTHED_ADMIN, "a", "b", "c");
    expect(next.user?.capabilities).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
  });

  test("throws on anonymous session — adding caps to no user is a test bug", () => {
    expect(() => withCapabilities(anonymousSession(), "x")).toThrow(
      /anonymous session/i,
    );
  });
});

describe("rpcOkBody", () => {
  test("wraps payload in oRPC envelope", () => {
    expect(rpcOkBody({ id: 1, name: "x" })).toBe(
      '{"json":{"id":1,"name":"x"},"meta":[]}',
    );
  });

  test("coerces undefined → null so the envelope stays well-formed", () => {
    // Without coercion, JSON.stringify drops the `json` key entirely
    // and the envelope becomes `{"meta":[]}` — an oRPC client would
    // mis-interpret as a missing field.
    expect(rpcOkBody(undefined)).toBe('{"json":null,"meta":[]}');
  });

  test("preserves explicit null", () => {
    expect(rpcOkBody(null)).toBe('{"json":null,"meta":[]}');
  });

  test("handles arrays", () => {
    expect(rpcOkBody([1, 2, 3])).toBe('{"json":[1,2,3],"meta":[]}');
  });
});

describe("rpcErrorBody", () => {
  test("wraps an error envelope", () => {
    const out = rpcErrorBody({ code: "FORBIDDEN", message: "no" });
    expect(JSON.parse(out)).toEqual({
      json: { code: "FORBIDDEN", message: "no" },
      meta: [],
    });
  });

  test("preserves the data field", () => {
    const out = rpcErrorBody({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
    expect(JSON.parse(out)).toMatchObject({
      json: { code: "CONFLICT", data: { reason: "slug_taken" } },
    });
  });
});

describe("AUTHED_ADMIN", () => {
  test("has a baseline admin user with the bare-install capabilities", () => {
    expect(AUTHED_ADMIN.user?.role).toBe("admin");
    expect(AUTHED_ADMIN.user?.capabilities).toEqual(
      expect.arrayContaining(["settings:manage", "plugin:manage", "user:list"]),
    );
  });

  test("needsBootstrap is false (the admin already exists)", () => {
    expect(AUTHED_ADMIN.needsBootstrap).toBe(false);
  });
});
