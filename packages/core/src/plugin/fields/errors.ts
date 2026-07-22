type FieldConfigErrorCode =
  | "range_missing_bounds"
  | "range_min_greater_than_max"
  | "repeater_nested_not_supported"
  | "repeater_sub_field_key_forbidden"
  | "repeater_sub_field_key_invalid"
  | "repeater_sub_field_duplicate"
  | "repeater_sub_field_condition_not_supported"
  | "temporal_bound_invalid";

interface FieldConfigErrorFields {
  fieldKey?: string;
  repeaterKey?: string;
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
  readonly repeaterKey: string | undefined;
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
    this.repeaterKey = fields.repeaterKey;
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

  static repeaterNestedNotSupported(ctx: {
    repeaterKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "repeater_nested_not_supported",
      `repeater("${ctx.repeaterKey}") subFields contains a nested repeater ` +
        `("${ctx.subFieldKey}"); nested repeaters are not supported in v0.1.`,
      ctx,
    );
  }

  static repeaterSubFieldKeyForbidden(ctx: {
    repeaterKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "repeater_sub_field_key_forbidden",
      `repeater("${ctx.repeaterKey}") subField key "${ctx.subFieldKey}" is forbidden ` +
        `(prototype-pollution risk).`,
      ctx,
    );
  }

  static repeaterSubFieldKeyInvalid(ctx: {
    repeaterKey: string;
    subFieldKey: string;
    pattern: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "repeater_sub_field_key_invalid",
      `repeater("${ctx.repeaterKey}") subField key "${ctx.subFieldKey}" must match ` +
        `/${ctx.pattern}/.`,
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

  static repeaterSubFieldCondition(ctx: {
    repeaterKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "repeater_sub_field_condition_not_supported",
      `repeater("${ctx.repeaterKey}") subField "${ctx.subFieldKey}" does not ` +
        `support visibleWhen — row-scoped conditions are not implemented.`,
      ctx,
    );
  }

  static repeaterSubFieldDuplicate(ctx: {
    repeaterKey: string;
    subFieldKey: string;
  }): FieldConfigError {
    return new FieldConfigError(
      "repeater_sub_field_duplicate",
      `repeater("${ctx.repeaterKey}") declares subField "${ctx.subFieldKey}" more than once.`,
      ctx,
    );
  }
}
