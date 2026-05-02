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
    throw new MagicLinkRequestError("not_configured");
  }
  if (response.status === 400) {
    throw new MagicLinkRequestError("invalid_input");
  }
  if (!response.ok) {
    throw new MagicLinkRequestError("network");
  }

  return (await response.json()) as MagicLinkRequestResponse;
}

type MagicLinkRequestErrorCode = "not_configured" | "invalid_input" | "network";

export class MagicLinkRequestError extends Error {
  readonly code: MagicLinkRequestErrorCode;

  constructor(code: MagicLinkRequestErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MagicLinkRequestError";
    this.code = code;
  }
}

const REQUEST_ERROR_MESSAGES: Record<MagicLinkRequestErrorCode, string> = {
  not_configured: "Magic-link sign-in isn't configured on this site.",
  invalid_input: "Enter a valid email address.",
  network: "Couldn't send the link. Try again.",
};

export function getMagicLinkRequestErrorMessage(error: unknown): string {
  if (error instanceof MagicLinkRequestError) {
    return REQUEST_ERROR_MESSAGES[error.code];
  }
  return REQUEST_ERROR_MESSAGES.network;
}
