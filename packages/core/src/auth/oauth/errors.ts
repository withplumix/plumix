export const OAUTH_ERROR_CODES = [
  "provider_not_configured",
  "state_invalid",
  "state_expired",
  "code_exchange_failed",
  "profile_fetch_failed",
  "email_missing",
  "email_unverified",
  "domain_not_allowed",
  "account_disabled",
  "link_broken",
  "registration_closed",
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export class OAuthError extends Error {
  static {
    OAuthError.prototype.name = "OAuthError";
  }

  readonly code: OAuthErrorCode;

  private constructor(code: OAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static providerNotConfigured(): OAuthError {
    return new OAuthError("provider_not_configured", "provider_not_configured");
  }

  static stateInvalid(): OAuthError {
    return new OAuthError("state_invalid", "state_invalid");
  }

  static stateExpired(): OAuthError {
    return new OAuthError("state_expired", "state_expired");
  }

  static codeExchangeFailed(ctx: { reason: string }): OAuthError {
    return new OAuthError("code_exchange_failed", ctx.reason);
  }

  static profileFetchFailed(ctx: { reason: string }): OAuthError {
    return new OAuthError("profile_fetch_failed", ctx.reason);
  }

  static emailMissing(): OAuthError {
    return new OAuthError("email_missing", "email_missing");
  }

  static emailUnverified(): OAuthError {
    return new OAuthError("email_unverified", "email_unverified");
  }

  static domainNotAllowed(): OAuthError {
    return new OAuthError("domain_not_allowed", "domain_not_allowed");
  }

  static accountDisabled(): OAuthError {
    return new OAuthError("account_disabled", "account_disabled");
  }

  static linkBroken(): OAuthError {
    return new OAuthError("link_broken", "link_broken");
  }

  static registrationClosed(): OAuthError {
    return new OAuthError("registration_closed", "registration_closed");
  }
}
