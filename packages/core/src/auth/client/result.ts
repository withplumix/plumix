import type { MessageDescriptor } from "@lingui/core";

/** Why an `authClient` call failed. Expected failures resolve; nothing throws. */
export interface AuthClientError {
  /** The server's `{ error }` code, or one the browser hit around the call. */
  readonly code: string;
  readonly message: MessageDescriptor;
}

export type AuthResult<T> =
  | { readonly data: T; readonly error: null }
  | { readonly data: null; readonly error: AuthClientError };

/**
 * Plain descriptors, not the Lingui macro: a theme translates them by `id` in
 * its own catalog, and `message` is the source text.
 */
const MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  network_error: {
    id: "authClient.error.networkError",
    message: "Couldn't reach the server. Try again.",
  },
  invalid_input: {
    id: "authClient.error.invalidInput",
    message: "Check what you entered and try again.",
  },
  user_cancelled: {
    id: "authClient.error.userCancelled",
    message: "Sign-in was cancelled.",
  },
  no_authenticator: {
    id: "authClient.error.noAuthenticator",
    message: "This device has no passkey for this site.",
  },
  method_not_registered: {
    id: "authClient.error.methodNotRegistered",
    message: "This sign-in method isn't available here.",
  },
};

const UNKNOWN: MessageDescriptor = {
  id: "authClient.error.unknown",
  message: "Something went wrong. Try again.",
};

export function failure(code: string): AuthResult<never> {
  return { data: null, error: { code, message: MESSAGES[code] ?? UNKNOWN } };
}

export function success<T>(data: T): AuthResult<T> {
  return { data, error: null };
}
