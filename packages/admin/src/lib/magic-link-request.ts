import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { createStrictErrorDescriptorRegistry } from "./error-descriptor-registry.js";

// The login screen's copy for a link request, keyed by the code
// `authClient.signIn.magicLink` resolves.

type MagicLinkRequestErrorCode = "not_configured" | "invalid_input" | "network";

const MESSAGES: Record<MagicLinkRequestErrorCode, MessageDescriptor> = {
  not_configured: defineMessage({
    id: "magicLinkRequest.error.notConfigured",
    message: "Magic-link sign-in isn't configured on this site.",
  }),
  invalid_input: defineMessage({
    id: "magicLinkRequest.error.invalidInput",
    message: "Enter a valid email address.",
  }),
  network: defineMessage({
    id: "magicLinkRequest.error.network",
    message: "Couldn't send the link. Try again.",
  }),
};

const registry = createStrictErrorDescriptorRegistry(MESSAGES, "network");

const EMAIL_REQUIRED = defineMessage({
  id: "login.magicLink.emailRequired",
  message: "Enter your email above first.",
});

/** Why a link can't be requested for `email` yet, or `null` when it can. */
export function magicLinkEmailError(email: string): MessageDescriptor | null {
  return email.trim() ? null : EMAIL_REQUIRED;
}

/** Any code the server doesn't explain gets the generic `network` copy. */
export function magicLinkRequestErrorDescriptor(
  code: string,
): MessageDescriptor {
  if (code === "magic_link_not_configured") {
    return registry.descriptor("not_configured");
  }
  return registry.descriptor(
    code === "invalid_input" ? "invalid_input" : "network",
  );
}
