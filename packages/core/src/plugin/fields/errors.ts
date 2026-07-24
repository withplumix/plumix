type FieldConfigErrorCode =
  | "range_missing_bounds"
  | "range_min_greater_than_max"
  | "sub_field_key_forbidden"
  | "sub_field_key_invalid"
  | "sub_field_duplicate"
  | "sub_field_condition_not_supported"
  | "temporal_bound_invalid";

/** The composite field types that own a list of sub-fields. */
export type SubFieldContainer = "repeater" | "group";

interface FieldConfigErrorFields {
  fieldKey?: string;
  container?: SubFieldContainer;
  containerKey?: string;
  subFieldKey?: string;
  min?: number;
  max?: number;
  pattern?: string;
}

export class FieldConfigError extends Error {
  static {
    FieldConfigError.prototype.name = "FieldConfigError";
  }

  readonly code: FieldConfigErrorCode;
  readonly fieldKey: string | undefined;
  readonly container: SubFieldContainer | undefined;
  readonly containerKey: string | undefined;
  readonly subFieldKey: string | undefined;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly pattern: string | undefined;

  private constructor(
    code: FieldConfigErrorCode,
    message: string,
    fields: FieldConfigErrorFields,
  ) {
    super(message);
    this.code = code;
    this.fieldKey = fields.fieldKey;
    this.container = fields.container;
    this.containerKey = fields.containerKey;
    this.subFieldKey = fields.subFieldKey;
    this.min = fields.min;
    this.max = fields.max;
    this.pattern = fields.pattern;
  }

  static rangeMissingBounds(ctx: { fieldKey: string }): FieldConfigError {
    return new FieldConfigError(
      "range_missing_bounds",
      `range field "${ctx.fieldKey}": both .min() and .max() are required ` +
        `so the slider has a concrete range.`,
      ctx,
    );
  }

  static rangeMinGreaterThanMax(ctx: {
    fieldKey: string;
    min: number;
    max: number;
  }): FieldConfigError {
    return new FieldConfigError(
      "range_min_greater_than_max",
      `range field "${ctx.fieldKey}": min (${String(ctx.min)}) must be <= max (${String(ctx.max)})`,
      ctx,
    );
  }

  static subFieldKeyForbidden(ctx: {
    container: SubFieldContainer;
    containerKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "sub_field_key_forbidden",
      `${ctx.container}("${ctx.containerKey}") field key "${ctx.subFieldKey}" is ` +
        `forbidden (prototype-pollution risk).`,
      ctx,
    );
  }

  static subFieldKeyInvalid(ctx: {
    container: SubFieldContainer;
    containerKey: string;
    subFieldKey: string;
    pattern: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "sub_field_key_invalid",
      `${ctx.container}("${ctx.containerKey}") field key "${ctx.subFieldKey}" ` +
        `must match /${ctx.pattern}/.`,
      ctx,
    );
  }

  static subFieldDuplicate(ctx: {
    container: SubFieldContainer;
    containerKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "sub_field_duplicate",
      `${ctx.container}("${ctx.containerKey}") declares field "${ctx.subFieldKey}" ` +
        `more than once.`,
      ctx,
    );
  }

  static subFieldCondition(ctx: {
    container: SubFieldContainer;
    containerKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "sub_field_condition_not_supported",
      `${ctx.container}("${ctx.containerKey}") field "${ctx.subFieldKey}" does not ` +
        `support visibleWhen — nested conditions are not implemented.`,
      ctx,
    );
  }

  static temporalBoundInvalid(ctx: {
    fieldKey: string;
    bound: "min" | "max";
    value: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "temporal_bound_invalid",
      `field "${ctx.fieldKey}": .${ctx.bound}("${ctx.value}") is not a valid ` +
        `temporal bound — use the field's stored ISO shape.`,
      { fieldKey: ctx.fieldKey },
    );
  }
}
