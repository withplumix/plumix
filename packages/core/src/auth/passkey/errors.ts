// challenge_expired is folded into challenge_not_found — `consumeChallenge`
// returns null whether the row was missing or just expired, since the
// distinction is meaningless to the caller (and leaking it would help
// timing-distinguish stale from never-issued).
export type PasskeyErrorCode =
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
  | "invalid_signature"
  | "counter_replay"
  | "user_not_found"
  | "invalid_response";

// Structured diagnostic payload. Never returned to clients — the dispatcher
// pulls it off via `error.detail` for server-side logging only.
export interface PasskeyErrorDetail {
  readonly expected?: string;
  readonly actual?: string;
}

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  readonly detail: PasskeyErrorDetail;

  constructor(
    code: PasskeyErrorCode,
    message?: string,
    detail: PasskeyErrorDetail = {},
  ) {
    super(message ?? code);
    this.name = "PasskeyError";
    this.code = code;
    this.detail = detail;
  }
}
