// challenge_expired is folded into challenge_not_found — `consumeChallenge`
// returns null whether the row was missing or just expired, since the
// distinction is meaningless to the caller (and leaking it would help
// timing-distinguish stale from never-issued).
//
// Admin's `passkey-errors.ts` mirrors this tuple via a compile-time
// assertion; changing it will trip an admin typecheck failure.
export const PASSKEY_ERROR_CODES = [
  "challenge_not_found",
  "invalid_client_data",
  "invalid_origin",
  "invalid_rp_id",
  "user_presence_missing",
  "unsupported_attestation_format",
  "unsupported_algorithm",
  "credential_already_registered",
  "credential_limit_reached",
  "credential_not_found",
  "credential_storage_corrupt",
  "invalid_signature",
  "counter_replay",
  "user_not_found",
  "invalid_response",
] as const;

export type PasskeyErrorCode = (typeof PASSKEY_ERROR_CODES)[number];

// Structured diagnostic payload. Never returned to clients — the dispatcher
// pulls it off via `error.detail` for server-side logging only.
interface PasskeyErrorDetail {
  readonly expected?: string;
  readonly actual?: string;
}

export class PasskeyError extends Error {
  static {
    PasskeyError.prototype.name = "PasskeyError";
  }

  readonly code: PasskeyErrorCode;
  readonly detail: PasskeyErrorDetail;

  private constructor(
    code: PasskeyErrorCode,
    message: string,
    detail: PasskeyErrorDetail = {},
  ) {
    super(message);
    this.code = code;
    this.detail = detail;
  }

  static challengeNotFound(): PasskeyError {
    return new PasskeyError("challenge_not_found", "challenge_not_found");
  }

  static invalidClientData(ctx: {
    expectedType: "get" | "create";
  }): PasskeyError {
    return new PasskeyError(
      "invalid_client_data",
      `Expected webauthn.${ctx.expectedType}`,
    );
  }

  static invalidOrigin(ctx: {
    expected: string;
    actual: string;
  }): PasskeyError {
    return new PasskeyError("invalid_origin", "invalid_origin", {
      expected: ctx.expected,
      actual: ctx.actual,
    });
  }

  static invalidRpId(): PasskeyError {
    return new PasskeyError("invalid_rp_id", "invalid_rp_id");
  }

  static userPresenceMissing(): PasskeyError {
    return new PasskeyError("user_presence_missing", "user_presence_missing");
  }

  static unsupportedAttestationFormat(ctx: { format: string }): PasskeyError {
    return new PasskeyError(
      "unsupported_attestation_format",
      `Unsupported attestation format: ${ctx.format}`,
    );
  }

  static unsupportedAlgorithm(ctx: { reason: string }): PasskeyError {
    return new PasskeyError("unsupported_algorithm", ctx.reason);
  }

  static credentialAlreadyRegistered(): PasskeyError {
    return new PasskeyError(
      "credential_already_registered",
      "credential_already_registered",
    );
  }

  static credentialLimitReached(): PasskeyError {
    return new PasskeyError(
      "credential_limit_reached",
      "credential_limit_reached",
    );
  }

  static credentialNotFound(): PasskeyError {
    return new PasskeyError("credential_not_found", "credential_not_found");
  }

  static credentialStorageCorrupt(ctx: { reason: string }): PasskeyError {
    return new PasskeyError("credential_storage_corrupt", ctx.reason);
  }

  static invalidSignature(): PasskeyError {
    return new PasskeyError("invalid_signature", "invalid_signature");
  }

  static counterReplay(): PasskeyError {
    return new PasskeyError("counter_replay", "counter_replay");
  }

  static userNotFound(): PasskeyError {
    return new PasskeyError("user_not_found", "user_not_found");
  }

  static invalidResponse(ctx: { reason: string }): PasskeyError {
    return new PasskeyError("invalid_response", ctx.reason);
  }
}
