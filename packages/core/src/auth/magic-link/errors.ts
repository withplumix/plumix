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
  readonly code: MagicLinkErrorCode;

  constructor(code: MagicLinkErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MagicLinkError";
    this.code = code;
  }
}
