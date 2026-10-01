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
   * Canonical origin the browser puts in clientDataJSON. Accepts an
   * `(env) => string` resolver so it can be sourced from a runtime env var
   * (`PUBLIC_ORIGIN`) per deploy instead of hardcoded — resolved per request.
   */
  readonly origin: EnvInput<string>;
  /**
   * Extra origins accepted at verification alongside `origin` — each an exact
   * origin (`https://www.example.com`) or a subdomain wildcard
   * (`https://*.acme.workers.dev`). Every entry's host must be `rpId` or a
   * subdomain of it, so a credential bound to `rpId` stays valid across them
   * (the WebAuthn registrable-suffix rule). The wildcard form is how one
   * passkey spans unbounded per-branch preview hosts. Accepts an `(env) => …`
   * resolver; defaults to none — verification stays pinned to `origin`.
   */
  readonly allowedOrigins?: EnvInput<readonly string[]>;
}
