import type { MagicLinkErrorCode } from "@plumix/core";

const MESSAGES: Record<MagicLinkErrorCode, string> = {
  missing_token:
    "That sign-in link is missing its token. Request a new one and try again.",
  token_invalid:
    "That sign-in link isn't valid. It may have already been used. Request a new one.",
  token_expired: "That sign-in link expired. Request a new one.",
  account_disabled: "That account is disabled.",
};

const FALLBACK = "Couldn't sign in. Try again.";

export function getMagicLinkErrorMessage(
  code: string | undefined,
): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code)
    ? MESSAGES[code as MagicLinkErrorCode]
    : FALLBACK;
}

// Test-only export so the unit test can assert every code in
// `MAGIC_LINK_ERROR_CODES` is mapped (no silent fallbacks).
export const MAGIC_LINK_ERROR_MESSAGES = MESSAGES;
