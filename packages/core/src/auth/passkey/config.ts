export interface PasskeyConfig {
  /** Display name shown in the OS passkey prompt. */
  readonly rpName: string;
  /** RP-ID — usually the bare hostname, no protocol. */
  readonly rpId: string;
  /** Expected origin string the browser puts in clientDataJSON. */
  readonly origin: string;
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
    challengeTtlMs: overrides.challengeTtlMs ?? PASSKEY_DEFAULTS.challengeTtlMs,
    maxCredentialsPerUser:
      overrides.maxCredentialsPerUser ?? PASSKEY_DEFAULTS.maxCredentialsPerUser,
  };
}
