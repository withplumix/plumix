// Server-side `PasskeyErrorCode` string union, kept in sync with
// packages/core/src/auth/passkey/errors.ts. We can't import the type — admin
// is a SPA build and @plumix/core is devDep-only for type-probe purposes —
// but the string literals are the wire contract.
type PasskeyServerErrorCode =
  | "challenge_not_found"
  | "invalid_client_data"
  | "invalid_origin"
  | "invalid_rp_id"
  | "user_presence_missing"
  | "unsupported_attestation_format"
  | "unsupported_algorithm"
  | "credential_already_registered"
  | "credential_limit_reached"
  | "credential_not_found"
  | "credential_storage_corrupt"
  | "invalid_signature"
  | "counter_replay"
  | "user_not_found"
  | "invalid_response"
  | "challenge_not_bound_to_user"
  | "registration_closed"
  | "email_mismatch"
  | "invalid_input";

// Browser-side failures we distinguish ourselves before/after the server call.
type PasskeyClientErrorCode =
  | "user_cancelled"
  | "no_authenticator"
  | "network_error"
  | "unknown";

export type PasskeyErrorCode = PasskeyServerErrorCode | PasskeyClientErrorCode;

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  constructor(code: PasskeyErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PasskeyError";
    this.code = code;
  }
}

const MESSAGES: Record<PasskeyErrorCode, string> = {
  // --- browser-side ---
  user_cancelled: "Sign-in was cancelled.",
  no_authenticator:
    "No passkey is available on this device. Try signing in on the device where you registered.",
  network_error:
    "Couldn't reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",

  // --- server-side: challenge/session ---
  challenge_not_found: "That sign-in attempt timed out. Please try again.",
  challenge_not_bound_to_user:
    "That sign-in attempt timed out. Please try again.",

  // --- server-side: request shape ---
  invalid_input:
    "Something went wrong with the form. Please reload and try again.",
  invalid_response:
    "Your device returned an unexpected response. Please try again.",
  invalid_client_data:
    "Your device returned an unexpected response. Please try again.",

  // --- server-side: origin/rp mismatch ---
  invalid_origin: "This passkey isn't usable on this site.",
  invalid_rp_id: "This passkey isn't usable on this site.",

  // --- server-side: user verification ---
  user_presence_missing:
    "Your device didn't confirm your presence. Please try again.",

  // --- server-side: algorithm/attestation ---
  unsupported_attestation_format:
    "Your device's response format isn't supported.",
  unsupported_algorithm: "Your device's signing algorithm isn't supported.",

  // --- server-side: credential storage ---
  credential_already_registered:
    "That passkey is already registered on this site.",
  credential_limit_reached:
    "You've reached the limit of passkeys for this account.",
  credential_not_found:
    "That passkey isn't registered on this site. Try a different one.",
  credential_storage_corrupt:
    "Your saved passkey data is corrupt. Please register a new one.",

  // --- server-side: signature verification ---
  invalid_signature: "Your device's signature didn't verify. Please try again.",
  counter_replay:
    "Your passkey appears to have been used on another device. Please re-register.",

  // --- server-side: users ---
  user_not_found: "No account found for that email.",
  registration_closed: "Sign-up is not open on this site.",
  email_mismatch: "That email doesn't match your signed-in account.",
};

export function getPasskeyErrorMessage(code: string): string {
  return code in MESSAGES
    ? MESSAGES[code as PasskeyErrorCode]
    : MESSAGES.unknown;
}
