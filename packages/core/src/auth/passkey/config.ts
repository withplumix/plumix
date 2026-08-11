import type { PlumixEnv } from "../../runtime/bindings.js";
import type { EnvInput } from "../../runtime/env-input.js";
import { resolveEnvInput } from "../../runtime/env-input.js";

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

/**
 * What `app.passkey` holds: the operator config plus resolved ceremony limits.
 * `origin`/`allowedOrigins` are still deferred — {@link resolvePasskeyOrigins}
 * resolves them per request once the runtime `env` exists.
 */
export interface PasskeyRuntimeConfig extends PasskeyConfig {
  readonly challengeTtlMs: number;
  readonly maxCredentialsPerUser: number;
}

/**
 * The passkey config the WebAuthn ceremony verifies against — same as the
 * runtime config but with `origin`/`allowedOrigins` resolved to concrete
 * strings for this request.
 */
export interface ResolvedPasskeyConfig extends Omit<
  PasskeyRuntimeConfig,
  "origin" | "allowedOrigins"
> {
  readonly origin: string;
  readonly allowedOrigins?: readonly string[];
}

export const PASSKEY_DEFAULTS = {
  challengeTtlMs: 5 * 60 * 1000,
  maxCredentialsPerUser: 10,
} as const;

export function resolvePasskeyConfig(
  config: PasskeyConfig,
  overrides: Partial<typeof PASSKEY_DEFAULTS> = {},
): PasskeyRuntimeConfig {
  return {
    ...config,
    challengeTtlMs: overrides.challengeTtlMs ?? PASSKEY_DEFAULTS.challengeTtlMs,
    maxCredentialsPerUser:
      overrides.maxCredentialsPerUser ?? PASSKEY_DEFAULTS.maxCredentialsPerUser,
  };
}

/** Resolve the deferred `origin`/`allowedOrigins` against the request `env`. */
export function resolvePasskeyOrigins(
  config: PasskeyRuntimeConfig,
  env: PlumixEnv,
): ResolvedPasskeyConfig {
  return {
    ...config,
    origin: resolveEnvInput(config.origin, env),
    // Guard stays: resolveEnvInput expects EnvInput<T>, not the optional.
    allowedOrigins:
      config.allowedOrigins !== undefined
        ? resolveEnvInput(config.allowedOrigins, env)
        : undefined,
  };
}
