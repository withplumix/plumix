export class ThemeError extends Error {
  static {
    ThemeError.prototype.name = "ThemeError";
  }

  readonly code: "invalid_theme_id" | "setup_not_a_function";
  readonly themeId: string;

  private constructor(
    code: "invalid_theme_id" | "setup_not_a_function",
    message: string,
    themeId: string,
  ) {
    super(message);
    this.code = code;
    this.themeId = themeId;
  }

  static invalidThemeId(ctx: {
    themeId: string;
    pattern: string;
    maxLength: number;
  }): ThemeError {
    return new ThemeError(
      "invalid_theme_id",
      `defineTheme: id "${ctx.themeId}" is invalid. Theme ids must ` +
        `match /${ctx.pattern}/ and be 1–${String(ctx.maxLength)} chars.`,
      ctx.themeId,
    );
  }

  static setupNotAFunction(ctx: { themeId: string }): ThemeError {
    return new ThemeError(
      "setup_not_a_function",
      `defineTheme("${ctx.themeId}"): \`setup\` must be a function when provided.`,
      ctx.themeId,
    );
  }
}
