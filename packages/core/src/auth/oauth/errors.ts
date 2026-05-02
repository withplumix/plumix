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
  readonly code: OAuthErrorCode;

  constructor(code: OAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OAuthError";
    this.code = code;
  }
}
