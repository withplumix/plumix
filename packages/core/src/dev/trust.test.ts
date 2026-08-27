import { afterEach, describe, expect, test, vi } from "vitest";

import { isTrustedDevHost, isTrustedDevRequest } from "./trust.js";

describe("isTrustedDevRequest", () => {
  afterEach(() => void vi.unstubAllEnvs());

  test("false in production, loopback or not", () => {
    vi.stubEnv("PLUMIX_DEV", "");

    expect(isTrustedDevRequest(new Request("http://localhost:5173/"))).toBe(
      false,
    );
  });

  test("the escape hatch does not open the gate in production", () => {
    vi.stubEnv("PLUMIX_DEV", "");
    vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", "1");

    expect(isTrustedDevRequest(new Request("https://cms.example/"))).toBe(
      false,
    );
  });

  test.each([
    "http://localhost:5173/",
    "http://127.0.0.1:5173/",
    "http://127.9.9.9:5173/",
    "http://[::1]:5173/",
  ])("true in dev over loopback: %s", (url) => {
    vi.stubEnv("PLUMIX_DEV", "1");

    expect(isTrustedDevRequest(new Request(url))).toBe(true);
  });

  test("false in dev for a non-loopback host — a tunnel, a LAN address, a codespace", () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    expect(isTrustedDevRequest(new Request("http://192.168.1.20:5173/"))).toBe(
      false,
    );
    expect(
      isTrustedDevRequest(new Request("https://x.trycloudflare.com/")),
    ).toBe(false);
  });

  test("the escape hatch trusts a non-loopback host in dev", () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", "1");

    expect(
      isTrustedDevRequest(new Request("https://x.trycloudflare.com/")),
    ).toBe(true);
  });
});

// The dev server's own Vite middlewares answer ahead of the worker and so never
// see a `Request` — they hold a Node `req.headers.host`, which is the same
// signal one field earlier (#2007).
describe("isTrustedDevHost", () => {
  afterEach(() => void vi.unstubAllEnvs());

  test.each(["localhost:5173", "127.0.0.1:5173", "[::1]:5173"])(
    "true for a loopback host header: %s",
    (host) => {
      expect(isTrustedDevHost(host)).toBe(true);
    },
  );

  test("false for an exposed host, and for none at all", () => {
    expect(isTrustedDevHost("x.trycloudflare.com")).toBe(false);
    expect(isTrustedDevHost(undefined)).toBe(false);
  });

  test("the escape hatch opens it", () => {
    vi.stubEnv("PLUMIX_DEV_ALLOW_REMOTE", "1");

    expect(isTrustedDevHost("x.trycloudflare.com")).toBe(true);
  });

  // Its callers are Vite middlewares, which cannot exist in a build — and where
  // `PLUMIX_DEV` is unset regardless, being a bundle define rather than
  // something the dev server's own Node process carries. Gating on it there
  // would close the dev error page in every session.
  test("does not read the build gate, unlike isTrustedDevRequest", () => {
    vi.stubEnv("PLUMIX_DEV", "");

    expect(isTrustedDevHost("localhost:5173")).toBe(true);
    expect(isTrustedDevRequest(new Request("http://localhost:5173/"))).toBe(
      false,
    );
  });
});
