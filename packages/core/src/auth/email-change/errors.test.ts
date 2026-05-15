import { describe, expect, test } from "vitest";

import { EmailChangeError } from "./errors.js";

describe("EmailChangeError — factories", () => {
  test.each([
    ["missingToken", () => EmailChangeError.missingToken(), "missing_token"],
    ["tokenInvalid", () => EmailChangeError.tokenInvalid(), "token_invalid"],
    ["tokenExpired", () => EmailChangeError.tokenExpired(), "token_expired"],
    ["emailTaken", () => EmailChangeError.emailTaken(), "email_taken"],
    ["userNotFound", () => EmailChangeError.userNotFound(), "user_not_found"],
    [
      "accountDisabled",
      () => EmailChangeError.accountDisabled(),
      "account_disabled",
    ],
  ])("%s produces class identity + code + message", (_label, factory, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(EmailChangeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EmailChangeError");
    expect(err.code).toBe(code);
    expect(err.message).toBe(code);
  });
});
