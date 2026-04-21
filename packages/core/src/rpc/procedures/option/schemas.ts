import * as v from "valibot";

// Option names follow a permissive WordPress-ish convention — allow letters,
// digits, underscores, dashes, dots. Kept reasonably tight to prevent wild
// keys from consumers; 191 mirrors the MySQL UTF8MB4 PK index limit the
// schema would hit on a future MySQL port.
const optionNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(191),
  v.regex(/^[a-zA-Z0-9_.-]+$/, "option name must be alphanumeric with _ - ."),
);

// Values are opaque strings — callers JSON-encode structured data themselves,
// matching wp_options' semantics. 1 MB cap prevents runaway inserts from
// becoming migration hazards.
const optionValueSchema = v.pipe(v.string(), v.maxLength(1_000_000));

export const optionListInputSchema = v.object({
  autoloadedOnly: v.optional(v.boolean()),
  prefix: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(191),
      v.regex(/^[a-zA-Z0-9_.-]+$/, "prefix must be alphanumeric with _ - ."),
    ),
  ),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
    100,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export const optionGetInputSchema = v.object({ name: optionNameSchema });

export const optionSetInputSchema = v.object({
  name: optionNameSchema,
  value: optionValueSchema,
  isAutoloaded: v.optional(v.boolean()),
});

export const optionDeleteInputSchema = v.object({ name: optionNameSchema });

// Bulk fetch used by the settings form loader — one round-trip instead
// of N. 200-name cap is generous (the largest plausible settings group
// won't come close); a hard ceiling blocks accidental fan-out from
// callers that iterate on untrusted input.
export const optionGetManyInputSchema = v.object({
  names: v.pipe(
    v.array(optionNameSchema),
    v.minLength(1, "provide at least one option name"),
    v.maxLength(200, "too many option names (max 200)"),
  ),
});

export type OptionListInput = v.InferOutput<typeof optionListInputSchema>;
export type OptionGetInput = v.InferOutput<typeof optionGetInputSchema>;
export type OptionSetInput = v.InferOutput<typeof optionSetInputSchema>;
export type OptionDeleteInput = v.InferOutput<typeof optionDeleteInputSchema>;
