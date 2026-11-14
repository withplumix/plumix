type ConfigErrorCode =
  "magic_link_requires_mailer" | "always_to_invalid_address";

/**
 * Config invariant violated as the site builds or boots, or by a config value
 * as it resolves at request-context time.
 */
export class ConfigError extends Error {
  static {
    ConfigError.prototype.name = "ConfigError";
  }

  readonly code: ConfigErrorCode;
  readonly hint: string | undefined;

  private constructor(
    code: ConfigErrorCode,
    message: string,
    hint: string | undefined,
  ) {
    super(message);
    this.code = code;
    this.hint = hint;
  }

  static magicLinkRequiresMailer(): ConfigError {
    return new ConfigError(
      "magic_link_requires_mailer",
      "`auth.magicLink` requires a top-level `mailer`.",
      "Set `mailer` in plumix.config.ts to a `Mailer` that sends through a " +
        "real transport, such as Resend, Postmark or Amazon SES.",
    );
  }

  static alwaysToInvalidAddress(address: string): ConfigError {
    return new ConfigError(
      "always_to_invalid_address",
      `alwaysTo(): ${JSON.stringify(address)} is not an email address.`,
      undefined,
    );
  }
}
