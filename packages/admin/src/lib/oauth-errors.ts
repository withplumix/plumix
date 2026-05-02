import type { OAuthErrorCode } from "@plumix/core";

const MESSAGES: Record<OAuthErrorCode, string> = {
  state_invalid: "Sign-in expired or invalid. Try again.",
  state_expired: "Sign-in expired. Try again.",
  code_exchange_failed: "Couldn't reach the provider. Try again.",
  profile_fetch_failed: "Couldn't read your profile. Try again.",
  email_missing: "The provider didn't return an email address.",
  email_unverified:
    "The provider hasn't verified your email yet. Verify it there, then try again.",
  domain_not_allowed:
    "Your email domain isn't on the allowlist. Ask an administrator to add it.",
  account_disabled: "That account is disabled.",
  link_broken:
    "That account can't be reached. Contact an administrator to re-link it.",
  registration_closed:
    "OAuth signup is unavailable until an admin has finished setup.",
  provider_not_configured: "That provider isn't configured.",
};

const FALLBACK = "Couldn't sign in. Try again.";

export function getOAuthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code)
    ? MESSAGES[code as OAuthErrorCode]
    : FALLBACK;
}

// Test-only export so the unit test can assert every code in
// `OAUTH_ERROR_CODES` is mapped (no silent fallbacks).
export const OAUTH_ERROR_MESSAGES = MESSAGES;
