import type { MessageDescriptor } from "@lingui/core";
import { PasskeyError } from "@/lib/passkey-errors.js";
import { defineMessage } from "@lingui/core/macro";

import {
  describeRpcError,
  rpcErrorCode,
  rpcErrorReason,
} from "@plumix/core/admin";

// What each profile card shows when one of its mutations fails.

const M = {
  emailTaken: defineMessage({
    id: "userEdit.email.error.taken",
    message: "That email is already in use on another account.",
  }),
  mailerNotConfigured: defineMessage({
    id: "userEdit.email.error.mailerNotConfigured",
    message:
      "Email change requires a magic-link mailer to be configured server-side. Pass `auth.magicLink` and `mailer:` to `plumix({...})` to enable.",
  }),
  accountDisabled: defineMessage({
    id: "userEdit.email.error.accountDisabled",
    message: "This account is disabled.",
  }),
  requestFallback: defineMessage({
    id: "userEdit.email.error.requestFallback",
    message: "Couldn't request the change. Try again.",
  }),
  // Shared "this passkey is gone" — surfaced by both the rename and
  // delete error helpers when the server returns NOT_FOUND.
  passkeyNotFound: defineMessage({
    id: "profile.passkeys.notFound",
    message: "This passkey no longer exists. Refresh the list.",
  }),
  passkeyRenameFallback: defineMessage({
    id: "profile.passkeys.rename.fallback",
    message: "Couldn't rename the passkey. Try again.",
  }),
  passkeyDeleteFallback: defineMessage({
    id: "profile.passkeys.delete.fallback",
    message: "Couldn't delete the passkey. Try again.",
  }),
  enrollCancelled: defineMessage({
    id: "profile.passkeys.enroll.cancelled",
    message: "Cancelled. Tap Add passkey when you're ready.",
  }),
  enrollAlreadyRegistered: defineMessage({
    id: "profile.passkeys.enroll.alreadyRegistered",
    message: "That passkey is already registered on this account.",
  }),
  enrollNoAuthenticator: defineMessage({
    id: "profile.passkeys.enroll.noAuthenticator",
    message: "This device doesn't support passkeys.",
  }),
  enrollNetworkError: defineMessage({
    id: "profile.passkeys.enroll.networkError",
    message: "Network error. Check your connection and try again.",
  }),
  enrollEmailMismatch: defineMessage({
    id: "profile.passkeys.enroll.emailMismatch",
    message: "Couldn't enrol — re-sign-in and try again.",
  }),
  enrollFallback: defineMessage({
    id: "profile.passkeys.enroll.fallback",
    message: "Couldn't enrol the passkey. Try again.",
  }),
  revokeAllSessionsFallback: defineMessage({
    id: "profile.sessions.revokeAll.fallback",
    message: "Couldn't revoke sessions. Try again.",
  }),
  revokeCurrentSession: defineMessage({
    id: "profile.sessions.revoke.current",
    message: "You can't revoke the session you're using right now.",
  }),
  sessionNotFound: defineMessage({
    id: "profile.sessions.revoke.notFound",
    message: "This session no longer exists. Refresh the list.",
  }),
  revokeSessionFallback: defineMessage({
    id: "profile.sessions.revoke.fallback",
    message: "Couldn't revoke the session. Try again.",
  }),
  mintApiTokenFallback: defineMessage({
    id: "apiTokens.mint.fallback",
    message: "Couldn't mint token. Try again.",
  }),
  revokeApiTokenFallback: defineMessage({
    id: "apiTokens.revoke.fallback",
    message: "Couldn't revoke. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * Shared "must keep one" copy — used as both the delete-disabled tooltip on
 * the row button and the explicit `last_credential` reason returned by the
 * server.
 */
export const LAST_PASSKEY_MESSAGE = defineMessage({
  id: "profile.passkeys.lastCredential",
  message: "You can't delete your last passkey. Add another one first.",
});

const REQUEST_EMAIL_CHANGE_ERRORS: Readonly<Record<string, MessageDescriptor>> =
  {
    email_taken: M.emailTaken,
    mailer_not_configured: M.mailerNotConfigured,
    account_disabled: M.accountDisabled,
  };

export function requestEmailChangeErrorDescriptor(
  err: unknown,
): MessageDescriptor {
  return describeRpcError(err, REQUEST_EMAIL_CHANGE_ERRORS, M.requestFallback);
}

export function passkeyRenameErrorDescriptor(err: unknown): MessageDescriptor {
  if (rpcErrorCode(err) === "NOT_FOUND") return M.passkeyNotFound;
  return describeRpcError(err, {}, M.passkeyRenameFallback);
}

export function passkeyDeleteErrorDescriptor(err: unknown): MessageDescriptor {
  if (rpcErrorReason(err) === "last_credential") return LAST_PASSKEY_MESSAGE;
  if (rpcErrorCode(err) === "NOT_FOUND") return M.passkeyNotFound;
  return describeRpcError(err, {}, M.passkeyDeleteFallback);
}

/** No `registration_closed`: signed-in users always pass that check. */
export function passkeyEnrollErrorDescriptor(err: unknown): MessageDescriptor {
  if (err instanceof PasskeyError) {
    switch (err.code) {
      case "user_cancelled":
        return M.enrollCancelled;
      case "credential_already_registered":
        return M.enrollAlreadyRegistered;
      case "no_authenticator":
        return M.enrollNoAuthenticator;
      case "network_error":
        return M.enrollNetworkError;
      case "email_mismatch":
        return M.enrollEmailMismatch;
    }
  }
  return describeRpcError(err, {}, M.enrollFallback);
}

export function revokeAllSessionsErrorDescriptor(
  err: unknown,
): MessageDescriptor {
  return describeRpcError(err, {}, M.revokeAllSessionsFallback);
}

export function revokeSessionErrorDescriptor(err: unknown): MessageDescriptor {
  if (rpcErrorReason(err) === "current_session") return M.revokeCurrentSession;
  if (rpcErrorCode(err) === "NOT_FOUND") return M.sessionNotFound;
  return describeRpcError(err, {}, M.revokeSessionFallback);
}

export function mintApiTokenErrorDescriptor(err: unknown): MessageDescriptor {
  return describeRpcError(err, {}, M.mintApiTokenFallback);
}

export function revokeApiTokenErrorDescriptor(err: unknown): MessageDescriptor {
  return describeRpcError(err, {}, M.revokeApiTokenFallback);
}
