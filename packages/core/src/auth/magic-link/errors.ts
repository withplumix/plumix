export const MAGIC_LINK_ERROR_CODES = [
  "missing_token",
  "token_invalid",
  "token_expired",
  "account_disabled",
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
