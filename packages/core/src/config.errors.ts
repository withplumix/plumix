type ConfigErrorCode = "magic_link_requires_mailer";

/**
 * Cross-field config invariant violated in {@link plumix} — surfaced at app
 * build time rather than on the first request. Mirrors the named-error
 * convention (umbrella #232).
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
}
