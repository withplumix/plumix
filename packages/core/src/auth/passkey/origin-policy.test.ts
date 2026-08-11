import { describe, expect, test } from "vitest";

import { originAllowed } from "./origin-policy.js";

describe("originAllowed", () => {
  test("accepts the primary origin", () => {
    expect(
      originAllowed("https://app.acme.workers.dev", {
        origin: "https://app.acme.workers.dev",
      }),
    ).toBe(true);
  });

  test("rejects a different origin when no allowedOrigins are set", () => {
    expect(
      originAllowed("https://feat-x-app.acme.workers.dev", {
        origin: "https://app.acme.workers.dev",
      }),
    ).toBe(false);
  });

  test("accepts an exact entry in allowedOrigins", () => {
    expect(
      originAllowed("https://www.example.com", {
        origin: "https://example.com",
        allowedOrigins: ["https://www.example.com"],
      }),
    ).toBe(true);
  });

  test("a wildcard entry spans every subdomain of its base", () => {
    const policy = {
      origin: "https://app.acme.workers.dev",
      allowedOrigins: ["https://*.acme.workers.dev"],
    };
    expect(originAllowed("https://feat-x-app.acme.workers.dev", policy)).toBe(
      true,
    );
    expect(originAllowed("https://feat-y-app.acme.workers.dev", policy)).toBe(
      true,
    );
  });

  test("a wildcard does not match the bare base (no subdomain label)", () => {
    expect(
      originAllowed("https://acme.workers.dev", {
        origin: "https://app.acme.workers.dev",
        allowedOrigins: ["https://*.acme.workers.dev"],
      }),
    ).toBe(false);
  });

  test("a wildcard match is dot-boundary safe (no greedy suffix)", () => {
    // `evilacme.workers.dev` ends with `acme.workers.dev` but is NOT a
    // subdomain of it — must be rejected.
    expect(
      originAllowed("https://evilacme.workers.dev", {
        origin: "https://app.acme.workers.dev",
        allowedOrigins: ["https://*.acme.workers.dev"],
      }),
    ).toBe(false);
  });

  test("a wildcard is scheme-strict (https only)", () => {
    expect(
      originAllowed("http://feat-x-app.acme.workers.dev", {
        origin: "https://app.acme.workers.dev",
        allowedOrigins: ["https://*.acme.workers.dev"],
      }),
    ).toBe(false);
  });

  test("a wildcard does not match a subdomain served on a non-default port", () => {
    expect(
      originAllowed("https://feat-x-app.acme.workers.dev:8443", {
        origin: "https://app.acme.workers.dev",
        allowedOrigins: ["https://*.acme.workers.dev"],
      }),
    ).toBe(false);
  });

  test("a malformed candidate is rejected, not thrown", () => {
    expect(
      originAllowed("not a url", {
        origin: "https://app.acme.workers.dev",
        allowedOrigins: ["https://*.acme.workers.dev"],
      }),
    ).toBe(false);
  });
});
