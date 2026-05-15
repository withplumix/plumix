export const MAGIC_LINK_ERROR_CODES = [
  "missing_token",
  "token_invalid",
  "token_expired",
  "account_disabled",
  // Signup-only — the click-the-link path provisioned a user, but the
  // domain's allowlist row is no longer enabled at verify time, or the
  // system is in zero-user state (bootstrap is passkey-only).
  "domain_not_allowed",
  "registration_closed",
] as const;

export type MagicLinkErrorCode = (typeof MAGIC_LINK_ERROR_CODES)[number];

export class MagicLinkError extends Error {
  static {
    MagicLinkError.prototype.name = "MagicLinkError";
  }

  readonly code: MagicLinkErrorCode;

  private constructor(code: MagicLinkErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static missingToken(): MagicLinkError {
    return new MagicLinkError("missing_token", "missing_token");
  }

  static tokenInvalid(): MagicLinkError {
    return new MagicLinkError("token_invalid", "token_invalid");
  }

  static tokenExpired(): MagicLinkError {
    return new MagicLinkError("token_expired", "token_expired");
  }

  static accountDisabled(): MagicLinkError {
    return new MagicLinkError("account_disabled", "account_disabled");
  }

  static domainNotAllowed(): MagicLinkError {
    return new MagicLinkError("domain_not_allowed", "domain_not_allowed");
  }

  static registrationClosed(): MagicLinkError {
    return new MagicLinkError("registration_closed", "registration_closed");
  }
}
