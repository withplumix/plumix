import { describe, expect, test } from "vitest";

import { OAuthError } from "./errors.js";

describe("OAuthError — no-context factories", () => {
  test.each([
    [
      "providerNotConfigured",
      () => OAuthError.providerNotConfigured(),
      "provider_not_configured",
    ],
    ["stateInvalid", () => OAuthError.stateInvalid(), "state_invalid"],
    ["stateExpired", () => OAuthError.stateExpired(), "state_expired"],
    ["emailMissing", () => OAuthError.emailMissing(), "email_missing"],
    ["emailUnverified", () => OAuthError.emailUnverified(), "email_unverified"],
    [
      "domainNotAllowed",
      () => OAuthError.domainNotAllowed(),
      "domain_not_allowed",
    ],
    ["accountDisabled", () => OAuthError.accountDisabled(), "account_disabled"],
    ["linkBroken", () => OAuthError.linkBroken(), "link_broken"],
    [
      "registrationClosed",
      () => OAuthError.registrationClosed(),
      "registration_closed",
    ],
  ])("%s produces class identity + code + message", (_label, factory, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("OAuthError");
    expect(err.code).toBe(code);
    expect(err.message).toBe(code);
  });
});

describe("OAuthError.codeExchangeFailed", () => {
  test("class identity, code, and supplied reason as message", () => {
    const err = OAuthError.codeExchangeFailed({ reason: "network error" });
    expect(err.code).toBe("code_exchange_failed");
    expect(err.message).toBe("network error");
  });
});

describe("OAuthError.profileFetchFailed", () => {
  test("class identity, code, and supplied reason as message", () => {
    const err = OAuthError.profileFetchFailed({ reason: "status 503" });
    expect(err.code).toBe("profile_fetch_failed");
    expect(err.message).toBe("status 503");
  });
});
