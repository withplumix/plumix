import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { EmailChangeErrorCode } from "@plumix/core";

import { createNullableErrorDescriptorRegistry } from "./error-descriptor-registry.js";

const MESSAGES: Record<EmailChangeErrorCode, MessageDescriptor> = {
  missing_token: defineMessage({
    id: "emailChange.error.missingToken",
    message:
      "That confirmation link is missing its token. Request a new email change.",
  }),
  token_invalid: defineMessage({
    id: "emailChange.error.tokenInvalid",
    message:
      "That confirmation link isn't valid. It may have already been used.",
  }),
  token_expired: defineMessage({
    id: "emailChange.error.tokenExpired",
    message: "That confirmation link expired. Request a new email change.",
  }),
  email_taken: defineMessage({
    id: "emailChange.error.emailTaken",
    message:
      "Someone else claimed that email between the request and your click. Request a new change to a different address.",
  }),
  user_not_found: defineMessage({
    id: "emailChange.error.userNotFound",
    message: "The account this confirmation belongs to has been removed.",
  }),
  account_disabled: defineMessage({
    id: "emailChange.error.accountDisabled",
    message: "The account this confirmation belongs to is disabled.",
  }),
};

const FALLBACK = defineMessage({
  id: "emailChange.error.fallback",
  message: "Couldn't confirm the email change. Try again.",
});

const registry = createNullableErrorDescriptorRegistry(MESSAGES, FALLBACK);

export const emailChangeErrorDescriptor = registry.descriptor;
export const useEmailChangeErrorMessage = registry.useMessage;

// Test-only export so the unit test can assert every code in
// `EMAIL_CHANGE_ERROR_CODES` is mapped (no silent fallbacks).
export const EMAIL_CHANGE_ERROR_MESSAGES = registry._messages;
