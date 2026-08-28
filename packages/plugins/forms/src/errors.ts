type FormsErrorCode =
  "duplicate_form_slug" | "insert_returned_no_row" | "unsupported_field_type";

interface FormsErrorFields {
  slug?: string;
  contributor?: string;
  existingContributor?: string;
  key?: string;
  inputType?: string;
  supported?: readonly string[];
}

export class FormsError extends Error {
  static {
    FormsError.prototype.name = "FormsError";
  }

  readonly code: FormsErrorCode;
  readonly slug: string | undefined;
  readonly contributor: string | undefined;
  readonly existingContributor: string | undefined;
  readonly key: string | undefined;
  readonly inputType: string | undefined;
  readonly supported: readonly string[] | undefined;

  private constructor(
    code: FormsErrorCode,
    message: string,
    fields: FormsErrorFields,
  ) {
    super(message);
    this.code = code;
    this.slug = fields.slug;
    this.contributor = fields.contributor;
    this.existingContributor = fields.existingContributor;
    this.key = fields.key;
    this.inputType = fields.inputType;
    this.supported = fields.supported;
  }

  static duplicateFormSlug(ctx: {
    slug: string;
    contributor: string;
    existingContributor: string;
  }): FormsError {
    return new FormsError(
      "duplicate_form_slug",
      `forms: two forms claim the slug "${ctx.slug}" — one from ` +
        `${ctx.existingContributor}, one from ${ctx.contributor}. The slug is ` +
        `the form's identity: submissions reference it, so the two cannot ` +
        `share one. Rename the later form.`,
      ctx,
    );
  }

  static insertReturnedNoRow(ctx: { slug: string }): FormsError {
    return new FormsError(
      "insert_returned_no_row",
      `forms: storing a submission for "${ctx.slug}" returned no row.`,
      ctx,
    );
  }

  static unsupportedFieldType(ctx: {
    slug: string;
    key: string;
    inputType: string;
    supported: readonly string[];
  }): FormsError {
    return new FormsError(
      "unsupported_field_type",
      `forms: field "${ctx.key}" on form "${ctx.slug}" is a ` +
        `${ctx.inputType} field, which this release cannot render or store. ` +
        `Declare it as one of: ${ctx.supported.join(", ")}.`,
      ctx,
    );
  }
}
