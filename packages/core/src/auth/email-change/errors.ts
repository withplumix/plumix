// Typed errors for the email-change flow. Mirrors the magic-link
// pattern: each error code maps to a stable string the verify route
// surfaces in the redirect query and the admin's login screen renders
// as actionable copy.
//
// Single source of truth: the runtime tuple drives both the type
// union and any drift-detection unit test that wants to assert every
// code is mapped in admin's `email-change-errors.ts`.
export const EMAIL_CHANGE_ERROR_CODES = [
  "missing_token",
  "token_invalid",
  "token_expired",
  "email_taken",
  "user_not_found",
  "account_disabled",
] as const;

export type EmailChangeErrorCode = (typeof EMAIL_CHANGE_ERROR_CODES)[number];

export class EmailChangeError extends Error {
  static {
    EmailChangeError.prototype.name = "EmailChangeError";
  }

  readonly code: EmailChangeErrorCode;

  private constructor(code: EmailChangeErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static missingToken(): EmailChangeError {
    return new EmailChangeError("missing_token", "missing_token");
  }

  static tokenInvalid(): EmailChangeError {
    return new EmailChangeError("token_invalid", "token_invalid");
  }

  static tokenExpired(): EmailChangeError {
    return new EmailChangeError("token_expired", "token_expired");
  }

  static emailTaken(): EmailChangeError {
    return new EmailChangeError("email_taken", "email_taken");
  }

  static userNotFound(): EmailChangeError {
    return new EmailChangeError("user_not_found", "user_not_found");
  }

  static accountDisabled(): EmailChangeError {
    return new EmailChangeError("account_disabled", "account_disabled");
  }
}
