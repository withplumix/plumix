import type { MetaFieldError } from "../meta/field-pipeline.js";

/**
 * A value `ctx.settings.write` refuses to store. `key` is `<group>.<key>`.
 */
export class SettingsWriteError extends Error {
  static {
    SettingsWriteError.prototype.name = "SettingsWriteError";
  }

  readonly data:
    | {
        readonly reason: "settings_invalid_value";
        readonly key: string;
        readonly errors?: MetaFieldError[];
      }
    | { readonly reason: "settings_value_too_large"; readonly key: string };

  private constructor(data: SettingsWriteError["data"], message: string) {
    super(message);
    this.data = data;
  }

  static invalidValue(
    key: string,
    errors?: MetaFieldError[],
  ): SettingsWriteError {
    return new SettingsWriteError(
      {
        reason: "settings_invalid_value",
        key,
        ...(errors === undefined ? {} : { errors }),
      },
      `invalid settings value: ${key}`,
    );
  }

  static valueTooLarge(key: string): SettingsWriteError {
    return new SettingsWriteError(
      { reason: "settings_value_too_large", key },
      `settings value too large: ${key}`,
    );
  }
}
