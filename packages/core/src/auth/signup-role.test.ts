import { describe, expect, test } from "vitest";

import { extractDomain, signupRole } from "./signup-role.js";

describe("signupRole", () => {
  const allowedDomains = { "example.com": "editor" } as const;

  test("gives a listed domain its role", () => {
    expect(signupRole({ email: "ann@example.com", allowedDomains })).toBe(
      "editor",
    );
  });

  test("matches the domain whatever its case", () => {
    expect(signupRole({ email: "ANN@Example.COM", allowedDomains })).toBe(
      "editor",
    );
  });

  test("keeps a listed domain's role over the default", () => {
    expect(
      signupRole({
        email: "ann@example.com",
        allowedDomains,
        defaultRole: "subscriber",
      }),
    ).toBe("editor");
  });

  test("gives an unlisted domain the default role", () => {
    expect(
      signupRole({
        email: "bob@other.com",
        allowedDomains,
        defaultRole: "subscriber",
      }),
    ).toBe("subscriber");
  });

  test("refuses an unlisted domain with no default role", () => {
    expect(signupRole({ email: "bob@other.com", allowedDomains })).toBe(
      undefined,
    );
  });

  test("refuses every domain when nothing is configured", () => {
    expect(signupRole({ email: "ann@example.com" })).toBe(undefined);
  });

  test("does not match a subdomain of a listed domain", () => {
    expect(signupRole({ email: "ann@mail.example.com", allowedDomains })).toBe(
      undefined,
    );
  });

  test("does not read a listed domain's inherited object keys", () => {
    expect(signupRole({ email: "ann@constructor", allowedDomains })).toBe(
      undefined,
    );
  });

  test("refuses an address with no domain, even with a default role", () => {
    expect(
      signupRole({ email: "not-an-email", defaultRole: "subscriber" }),
    ).toBe(undefined);
  });
});

describe("extractDomain", () => {
  test("returns the lowercased domain part", () => {
    expect(extractDomain("alice@Example.COM")).toBe("example.com");
  });

  test("handles addr-spec with subdomain", () => {
    expect(extractDomain("a@mail.example.com")).toBe("mail.example.com");
  });

  test("returns null when the local part is empty", () => {
    // Defense-in-depth — without this, `@evil.example` would leak
    // through to the allowlist match as the bare domain string.
    expect(extractDomain("@example.com")).toBeNull();
  });

  test("returns null when the domain part is empty", () => {
    expect(extractDomain("alice@")).toBeNull();
  });

  test("returns null when no @ is present", () => {
    expect(extractDomain("not-an-email")).toBeNull();
  });

  test("returns null on empty string", () => {
    expect(extractDomain("")).toBeNull();
  });
});
