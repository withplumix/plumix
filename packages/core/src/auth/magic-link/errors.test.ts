import { describe, expect, test } from "vitest";

import { MagicLinkError } from "./errors.js";

describe("MagicLinkError — factories", () => {
  test.each([
    ["missingToken", () => MagicLinkError.missingToken(), "missing_token"],
    ["tokenInvalid", () => MagicLinkError.tokenInvalid(), "token_invalid"],
    ["tokenExpired", () => MagicLinkError.tokenExpired(), "token_expired"],
    [
      "accountDisabled",
      () => MagicLinkError.accountDisabled(),
      "account_disabled",
    ],
    [
      "domainNotAllowed",
      () => MagicLinkError.domainNotAllowed(),
      "domain_not_allowed",
    ],
    [
      "registrationClosed",
      () => MagicLinkError.registrationClosed(),
      "registration_closed",
    ],
  ])("%s produces class identity + code + message", (_label, factory, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(MagicLinkError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MagicLinkError");
    expect(err.code).toBe(code);
    expect(err.message).toBe(code);
  });
});
