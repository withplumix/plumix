import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { OAuthErrorCode } from "@plumix/core";

import { createNullableErrorDescriptorRegistry } from "./error-descriptor-registry.js";

const MESSAGES: Record<OAuthErrorCode, MessageDescriptor> = {
  state_invalid: defineMessage({
    id: "oauth.error.stateInvalid",
    message: "Sign-in expired or invalid. Try again.",
  }),
  state_expired: defineMessage({
    id: "oauth.error.stateExpired",
    message: "Sign-in expired. Try again.",
  }),
  code_exchange_failed: defineMessage({
    id: "oauth.error.codeExchangeFailed",
    message: "Couldn't reach the provider. Try again.",
  }),
  profile_fetch_failed: defineMessage({
    id: "oauth.error.profileFetchFailed",
    message: "Couldn't read your profile. Try again.",
  }),
  email_missing: defineMessage({
    id: "oauth.error.emailMissing",
    message: "The provider didn't return an email address.",
  }),
  email_unverified: defineMessage({
    id: "oauth.error.emailUnverified",
    message:
      "The provider hasn't verified your email yet. Verify it there, then try again.",
  }),
  domain_not_allowed: defineMessage({
    id: "oauth.error.domainNotAllowed",
    message:
      "Your email domain isn't on the allowlist. Ask an administrator to add it.",
  }),
  account_disabled: defineMessage({
    id: "oauth.error.accountDisabled",
    message: "That account is disabled.",
  }),
  link_broken: defineMessage({
    id: "oauth.error.linkBroken",
    message:
      "That account can't be reached. Contact an administrator to re-link it.",
  }),
  registration_closed: defineMessage({
    id: "oauth.error.registrationClosed",
    message: "OAuth signup is unavailable until an admin has finished setup.",
  }),
  provider_not_configured: defineMessage({
    id: "oauth.error.providerNotConfigured",
    message: "That provider isn't configured.",
  }),
};

const FALLBACK = defineMessage({
  id: "oauth.error.fallback",
  message: "Couldn't sign in. Try again.",
});

const registry = createNullableErrorDescriptorRegistry(MESSAGES, FALLBACK);

export const oauthErrorDescriptor = registry.descriptor;
export const useOAuthErrorMessage = registry.useMessage;

// Test-only export so the unit test can assert every code in
// `OAUTH_ERROR_CODES` is mapped (no silent fallbacks).
export const OAUTH_ERROR_MESSAGES = registry._messages;
