// Empty rows are stripped before min/max bounds apply: blank rows are an
// authoring affordance, not data the caller meant to persist. Reference
// subfields inside rows skip the live-id check that top-level refs get
// from validateMetaReferences — recursion into rows is a post-0.1 follow-up.

import type { MetaBoxField } from "../manifest.js";

interface RepeaterValidationOptions {
  readonly min?: number;
  readonly max?: number;
}

// Hard ceiling on row count regardless of field-level `max`. The 256 KiB
// meta byte cap doesn't bound work pre-walk: a payload of N empty rows
// allocates O(N) before the byte cap measures the post-strip output.
// 1000 covers any realistic authoring (FAQ lists, link strips, gallery
// captions); above that, the user has modeled the wrong abstraction.
const MAX_REPEATER_ROWS = 1000;

export function walkRepeaterRows(
  subFields: readonly MetaBoxField[],
  options: RepeaterValidationOptions = {},
): (value: unknown) => unknown {
  return (value) => {
    if (value === null || value === undefined) return value;
    if (!Array.isArray(value)) {
      throw new RepeaterValidationError(
        "invalid_shape",
        "<root>",
        "repeater value must be an array of rows",
      );
    }
    if (value.length > MAX_REPEATER_ROWS) {
      throw new RepeaterValidationError(
        "invalid_shape",
        "<root>",
        `repeater input exceeds ${MAX_REPEATER_ROWS} rows`,
      );
    }
    const rows: Record<string, unknown>[] = [];
    value.forEach((rawRow, i) => {
      if (
        rawRow === null ||
        typeof rawRow !== "object" ||
        Array.isArray(rawRow)
      ) {
        throw new RepeaterValidationError(
          "invalid_shape",
          `[${i}]`,
          "repeater row must be a plain object",
        );
      }
      const inputRow = rawRow as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      let hasValue = false;
      for (const sf of subFields) {
        const raw = inputRow[sf.key];
        const sanitized = sf.sanitize
          ? runSubSanitize(sf, raw, `[${i}].${sf.key}`)
          : raw;
        if (sanitized !== null && sanitized !== undefined && sanitized !== "") {
          hasValue = true;
        }
        next[sf.key] = sanitized;
      }
      if (hasValue) rows.push(next);
    });
    if (options.min !== undefined && rows.length < options.min) {
      throw new RepeaterValidationError(
        "below_min",
        "<root>",
        `repeater requires at least ${options.min} non-empty row(s); got ${rows.length}`,
      );
    }
    if (options.max !== undefined && rows.length > options.max) {
      throw new RepeaterValidationError(
        "above_max",
        "<root>",
        `repeater allows at most ${options.max} row(s); got ${rows.length}`,
      );
    }
    return rows;
  };
}

export class RepeaterValidationError extends Error {
  readonly path: string;
  readonly reason:
    | "invalid_shape"
    | "below_min"
    | "above_max"
    | "subfield_invalid";
  constructor(
    reason: RepeaterValidationError["reason"],
    path: string,
    message: string,
  ) {
    super(message);
    this.path = path;
    this.reason = reason;
  }
}

function runSubSanitize(
  field: MetaBoxField,
  value: unknown,
  path: string,
): unknown {
  // Caller gates on `field.sanitize` — cast is a type-narrowing shortcut.
  const sanitize = field.sanitize as (v: unknown) => unknown;
  try {
    return sanitize(value);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RepeaterValidationError(
      "subfield_invalid",
      path,
      `repeater subfield "${field.key}" rejected value: ${detail}`,
    );
  }
}
