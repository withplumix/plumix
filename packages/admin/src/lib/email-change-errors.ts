import type { EmailChangeErrorCode } from "@plumix/core";

const MESSAGES: Record<EmailChangeErrorCode, string> = {
  missing_token:
    "That confirmation link is missing its token. Request a new email change.",
  token_invalid:
    "That confirmation link isn't valid. It may have already been used.",
  token_expired: "That confirmation link expired. Request a new email change.",
  email_taken:
    "Someone else claimed that email between the request and your click. Request a new change to a different address.",
  user_not_found: "The account this confirmation belongs to has been removed.",
  account_disabled: "The account this confirmation belongs to is disabled.",
};

const FALLBACK = "Couldn't confirm the email change. Try again.";

export function getEmailChangeErrorMessage(
  code: string | undefined,
): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code)
    ? MESSAGES[code as EmailChangeErrorCode]
    : FALLBACK;
}

// Test-only export so a future unit test can assert every code in
// `EmailChangeErrorCode` is mapped (no silent fallbacks).
export const EMAIL_CHANGE_ERROR_MESSAGES = MESSAGES;
