import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Extraction mirror for core's valibot validator messages (see
// `core-nav-i18n.ts` for the pattern). Rendering resolves the descriptor
// through admin's `bootI18n` resolver (`vMessage`). Lockstep with
// `packages/core/src/rpc/validation.ts` is test-guarded.

export const CORE_VALIDATION_DESCRIPTORS = {
  emailRequired: defineMessage({
    id: "validate.email.required",
    message: "Enter an email address.",
  }),
  emailMaxLength: defineMessage({
    id: "validate.email.maxLength",
    message: "Email is too long.",
  }),
  emailInvalid: defineMessage({
    id: "validate.email.invalid",
    message: "Enter a valid email address.",
  }),
  nameMaxLength: defineMessage({
    id: "validate.name.maxLength",
    message: "Name is too long.",
  }),
  idFormat: defineMessage({
    id: "validate.id.format",
    message: "id must be a positive decimal integer",
  }),
} satisfies Record<string, MessageDescriptor>;
