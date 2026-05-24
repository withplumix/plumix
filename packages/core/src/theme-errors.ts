type ThemeRegistrationCode =
  | "missing_theme"
  | "missing_index_template"
  | "document_invalid_link"
  | "document_invalid_script"
  | "invalid_template";

export class ThemeRegistrationError extends Error {
  static {
    ThemeRegistrationError.prototype.name = "ThemeRegistrationError";
  }

  readonly code: ThemeRegistrationCode;

  private constructor(code: ThemeRegistrationCode, message: string) {
    super(message);
    this.code = code;
  }

  static missingTheme(): ThemeRegistrationError {
    return new ThemeRegistrationError(
      "missing_theme",
      `Plumix config requires a \`theme\`. Every app renders public routes ` +
        `through a theme — there is no inline-HTML fallback. Define one with ` +
        `\`defineTheme({ templates: { index: …, … } })\` and pass it to ` +
        `\`plumix({ … , theme })\`.`,
    );
  }

  static missingIndexTemplate(): ThemeRegistrationError {
    return new ThemeRegistrationError(
      "missing_index_template",
      `Theme registration: \`templates.index\` is required. Every theme ` +
        `must declare an \`index\` template — it is the final fallback the ` +
        `template hierarchy walks to when no more-specific template matches.`,
    );
  }

  static documentInvalidLink(ctx: {
    index: number;
    slot?: string;
  }): ThemeRegistrationError {
    const source = ctx.slot
      ? `template \`${ctx.slot}\` document fragment`
      : "`theme:document` filter chain";
    return new ThemeRegistrationError(
      "document_invalid_link",
      `${source} produced a \`link[${ctx.index}]\` entry without a \`rel\` ` +
        `attribute. Every \`<link>\` in the document manifest must declare ` +
        `a \`rel\` — browsers ignore unkeyed link tags and the renderer ` +
        `would emit invalid HTML.`,
    );
  }

  static invalidTemplate(ctx: { slot: string }): ThemeRegistrationError {
    return new ThemeRegistrationError(
      "invalid_template",
      `Theme registration: templates.${ctx.slot} must be either a plain ` +
        `function (legacy form) or a Template built via \`defineTemplate({ ` +
        `render: ... })\`. A hand-written \`{ render }\` literal that ` +
        `didn't go through the factory is rejected so future deps / ` +
        `document-fragment fields don't get silently ignored.`,
    );
  }

  static documentInvalidScript(ctx: {
    index: number;
    slot?: string;
  }): ThemeRegistrationError {
    const source = ctx.slot
      ? `template \`${ctx.slot}\` document fragment`
      : "`theme:document` filter chain";
    return new ThemeRegistrationError(
      "document_invalid_script",
      `${source} produced a \`script[${ctx.index}]\` entry with neither ` +
        `\`src\` nor inline content (\`children\` / ` +
        `\`dangerouslySetInnerHTML\`). Scripts must reference a source URL ` +
        `or carry an inline body — an empty \`<script>\` tag is dead weight.`,
    );
  }
}

export class ThemeError extends Error {
  static {
    ThemeError.prototype.name = "ThemeError";
  }

  readonly code: "invalid_token_slug" | "invalid_token_value";
  readonly group: string;
  readonly slug: string;

  private constructor(
    code: "invalid_token_slug" | "invalid_token_value",
    message: string,
    group: string,
    slug: string,
  ) {
    super(message);
    this.code = code;
    this.group = group;
    this.slug = slug;
  }

  static invalidTokenSlug(ctx: { group: string; slug: string }): ThemeError {
    return new ThemeError(
      "invalid_token_slug",
      `defineTheme: tokens.${ctx.group} slug ${JSON.stringify(ctx.slug)} is invalid. ` +
        `Token slugs must match /^[a-z][a-z0-9-]*$/ — they are concatenated into CSS ` +
        `custom-property names, so whitespace or CSS-delimiter characters would break ` +
        `themes that bind them.`,
      ctx.group,
      ctx.slug,
    );
  }

  static invalidTokenValue(ctx: {
    group: string;
    slug: string;
    value: string;
  }): ThemeError {
    return new ThemeError(
      "invalid_token_value",
      `defineTheme: tokens.${ctx.group}.${ctx.slug} value ${JSON.stringify(ctx.value)} ` +
        `contains characters that would break out of a CSS declaration value ` +
        `(semicolons, braces, comment delimiters, or newlines). Themes embed token ` +
        `values via CSS \`var(...)\` references, so any of those bytes lets the token ` +
        `rewrite arbitrary rules.`,
      ctx.group,
      ctx.slug,
    );
  }
}
