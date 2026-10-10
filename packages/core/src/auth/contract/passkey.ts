import type { EnvInput } from "../../runtime/contract/env-input.js";

export interface PasskeyConfig {
  /** Display name shown in the OS passkey prompt. */
  readonly rpName: string;
  /**
   * RP-ID — the credential's anchor (usually the bare hostname). Deliberately
   * not an `EnvInput`: it must be constant across environments, or a passkey
   * enrolled in one can't verify in another.
   */
  readonly rpId: string;
  /**
   * The origin the browser puts in clientDataJSON; a resolver runs per request.
   */
  readonly origin: EnvInput<string>;
  /**
   * Exact https origins or `https://*.sub` wildcards, each with `rpId` as a
   * registrable suffix. Wildcards let one passkey span per-branch preview
   * hosts.
   */
  readonly allowedOrigins?: EnvInput<readonly string[]>;
}
