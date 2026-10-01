import type { PlumixEnv } from "../../runtime/contract/bindings.js";
import type { PasskeyConfig } from "../contract/passkey.js";
import { resolveEnvInput } from "../../runtime/contract/env-input.js";

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
