type ConfigErrorCode =
  "magic_link_requires_mailer" | "always_to_invalid_address";

/**
 * Config invariant violated in {@link plumix} or by a config value as it
 * resolves — surfaced at app build or request-context time. Follows the
 * named-error convention (umbrella #232).
 */
export class ConfigError extends Error {
  static {
    ConfigError.prototype.name = "ConfigError";
  }

  readonly code: ConfigErrorCode;

  private constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static magicLinkRequiresMailer(): ConfigError {
    return new ConfigError(
      "magic_link_requires_mailer",
      "plumix(): `auth.magicLink` requires a top-level `mailer` " +
        "(use `consoleMailer()` for dev or pass your own `Mailer`).",
    );
  }

  static alwaysToInvalidAddress(address: string): ConfigError {
    return new ConfigError(
      "always_to_invalid_address",
      `alwaysTo(): ${JSON.stringify(address)} is not an email address.`,
    );
  }
}
