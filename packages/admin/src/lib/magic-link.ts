import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { createStrictErrorDescriptorRegistry } from "./error-descriptor-registry.js";

// Client wrapper for the magic-link request endpoint. Not an oRPC
// procedure (the verify side is a top-level GET navigation, and the
// always-success response shape is intentionally hand-rolled rather
// than typed through oRPC).

interface MagicLinkRequestResponse {
  readonly ok: boolean;
  readonly message: string;
}

export async function requestMagicLink(
  email: string,
): Promise<MagicLinkRequestResponse> {
  const response = await fetch("/_plumix/auth/magic-link/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify({ email }),
    credentials: "same-origin",
  });

  if (response.status === 503) {
    throw MagicLinkRequestError.notConfigured();
  }
  if (response.status === 400) {
    throw MagicLinkRequestError.invalidInput();
  }
  if (!response.ok) {
    throw MagicLinkRequestError.network();
  }

  return (await response.json()) as MagicLinkRequestResponse;
}

type MagicLinkRequestErrorCode = "not_configured" | "invalid_input" | "network";

export class MagicLinkRequestError extends Error {
  static {
    MagicLinkRequestError.prototype.name = "MagicLinkRequestError";
  }

  readonly code: MagicLinkRequestErrorCode;

  private constructor(code: MagicLinkRequestErrorCode) {
    super(code);
    this.code = code;
  }

  static notConfigured(): MagicLinkRequestError {
    return new MagicLinkRequestError("not_configured");
  }

  static invalidInput(): MagicLinkRequestError {
    return new MagicLinkRequestError("invalid_input");
  }

  static network(): MagicLinkRequestError {
    return new MagicLinkRequestError("network");
  }
}

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

/** Convenience hook for the login route — resolves a thrown
 *  `MagicLinkRequestError` (or any unknown thrown value) through
 *  `useLabel` so the consumer renders a flat localized string.
 *  Unknown / non-MagicLinkRequestError values surface the generic
 *  `network` fallback descriptor. */
export function useMagicLinkRequestErrorMessage(): (error: unknown) => string {
  const resolve = registry.useMessage();
  return (error) =>
    resolve(error instanceof MagicLinkRequestError ? error.code : "network");
}
