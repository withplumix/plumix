export interface PasskeyConfig {
  /** Display name shown in the OS passkey prompt. */
  readonly rpName: string;
  /** RP-ID — usually the bare hostname, no protocol. */
  readonly rpId: string;
  /** Canonical origin string the browser puts in clientDataJSON. */
  readonly origin: string;
  /**
   * Extra origins accepted at verification alongside `origin` — each an exact
   * origin (`https://www.example.com`) or a subdomain wildcard
   * (`https://*.acme.workers.dev`). Every entry's host must be `rpId` or a
   * subdomain of it, so a credential bound to `rpId` stays valid across them
   * (the WebAuthn registrable-suffix rule). The wildcard form is how one
   * passkey spans unbounded per-branch preview hosts. Defaults to none —
   * verification stays pinned to `origin`.
   */
  readonly allowedOrigins?: readonly string[];
}

export interface ResolvedPasskeyConfig extends PasskeyConfig {
  readonly challengeTtlMs: number;
  readonly maxCredentialsPerUser: number;
}

export const PASSKEY_DEFAULTS = {
  challengeTtlMs: 5 * 60 * 1000,
  maxCredentialsPerUser: 10,
} as const;

export function resolvePasskeyConfig(
  config: PasskeyConfig,
  overrides: Partial<typeof PASSKEY_DEFAULTS> = {},
): ResolvedPasskeyConfig {
  return {
    rpName: config.rpName,
    rpId: config.rpId,
    origin: config.origin,
    allowedOrigins: config.allowedOrigins,
    challengeTtlMs: overrides.challengeTtlMs ?? PASSKEY_DEFAULTS.challengeTtlMs,
    maxCredentialsPerUser:
      overrides.maxCredentialsPerUser ?? PASSKEY_DEFAULTS.maxCredentialsPerUser,
  };
}
