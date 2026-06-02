import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { MagicLinkErrorCode } from "@plumix/core";

import { createNullableErrorDescriptorRegistry } from "./error-descriptor-registry.js";

const MESSAGES: Record<MagicLinkErrorCode, MessageDescriptor> = {
  missing_token: defineMessage({
    id: "magicLink.error.missingToken",
    message:
      "That sign-in link is missing its token. Request a new one and try again.",
  }),
  token_invalid: defineMessage({
    id: "magicLink.error.tokenInvalid",
    message:
      "That sign-in link isn't valid. It may have already been used. Request a new one.",
  }),
  token_expired: defineMessage({
    id: "magicLink.error.tokenExpired",
    message: "That sign-in link expired. Request a new one.",
  }),
  account_disabled: defineMessage({
    id: "magicLink.error.accountDisabled",
    message: "That account is disabled.",
  }),
  domain_not_allowed: defineMessage({
    id: "magicLink.error.domainNotAllowed",
    message:
      "Your email domain isn't on the allowlist anymore. Ask an administrator to add it.",
  }),
  registration_closed: defineMessage({
    id: "magicLink.error.registrationClosed",
    message:
      "Self-signup is unavailable until an administrator has finished setup.",
  }),
};

const FALLBACK = defineMessage({
  id: "magicLink.error.fallback",
  message: "Couldn't sign in. Try again.",
});

const registry = createNullableErrorDescriptorRegistry(MESSAGES, FALLBACK);

export const magicLinkErrorDescriptor = registry.descriptor;
export const useMagicLinkErrorMessage = registry.useMessage;

// Test-only export so the unit test can assert every code in
// `MAGIC_LINK_ERROR_CODES` is mapped (no silent fallbacks).
export const MAGIC_LINK_ERROR_MESSAGES = registry._messages;
