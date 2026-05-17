export class ThemeError extends Error {
  static {
    ThemeError.prototype.name = "ThemeError";
  }

  readonly code:
    | "invalid_theme_id"
    | "setup_not_a_function"
    | "invalid_token_slug"
    | "invalid_token_value";
  readonly themeId: string;
  readonly group: string | undefined;
  readonly slug: string | undefined;

  private constructor(
    code:
      | "invalid_theme_id"
      | "setup_not_a_function"
      | "invalid_token_slug"
      | "invalid_token_value",
    message: string,
    themeId: string,
    extra?: { group?: string; slug?: string },
  ) {
    super(message);
    this.code = code;
    this.themeId = themeId;
    this.group = extra?.group;
    this.slug = extra?.slug;
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

  static invalidTokenSlug(ctx: {
    themeId: string;
    group: string;
    slug: string;
  }): ThemeError {
    return new ThemeError(
      "invalid_token_slug",
      `defineTheme("${ctx.themeId}"): tokens.${ctx.group} slug ${JSON.stringify(
        ctx.slug,
      )} is invalid. Token slugs must match /^[a-z][a-z0-9-]*$/ — they ` +
        `are concatenated into CSS class names (e.g. "has-<slug>-padding") ` +
        `and CSS custom-property names (e.g. "--plumix-color-<slug>"), so ` +
        `whitespace, braces, or other CSS-delimiter characters break the ` +
        `stylesheet at build time.`,
      ctx.themeId,
      { group: ctx.group, slug: ctx.slug },
    );
  }

  static invalidTokenValue(ctx: {
    themeId: string;
    group: string;
    slug: string;
    value: string;
  }): ThemeError {
    return new ThemeError(
      "invalid_token_value",
      `defineTheme("${ctx.themeId}"): tokens.${ctx.group}.${ctx.slug} value ` +
        `${JSON.stringify(ctx.value)} contains characters that would break ` +
        `out of a CSS declaration value (semicolons, braces, comment ` +
        `delimiters, or newlines). The Vite plugin emits this value ` +
        `verbatim into ` +
        `\`virtual:plumix/blocks/tokens.css\`, so any of those bytes lets ` +
        `the token rewrite arbitrary rules in the bundle.`,
      ctx.themeId,
      { group: ctx.group, slug: ctx.slug },
    );
  }
}
