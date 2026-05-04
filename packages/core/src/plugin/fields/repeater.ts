import type {
  MetaBoxField,
  MetaBoxFieldSpan,
  RepeaterMetaBoxField,
} from "../manifest.js";
import { walkRepeaterRows } from "./repeater-validate.js";

export interface RepeaterFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  readonly subFields: readonly MetaBoxField[];
  readonly min?: number;
  readonly max?: number;
}

// Mirrors `META_FIELD_KEY_RE` in plugin/context.ts. The top-level
// registrar validates field keys against this regex but doesn't
// recurse into subFields, so the repeater builder enforces it locally
// — guards row-object shape and protects against duplicate-key clobber.
const REPEATER_SUBFIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

// `__proto__`/`constructor`/`prototype` match the key regex but writing
// them into a fresh object literal mutates the prototype chain. Reject
// at registration regardless of regex pass.
const FORBIDDEN_SUBFIELD_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Nested repeaters rejected at registration to keep v0.1 UX flat.
// Subfield keys are also validated here for shape + uniqueness — the
// top-level `assertMetaBoxFields` only walks the outer fields array.
export function repeater(options: RepeaterFieldOptions): RepeaterMetaBoxField {
  const seen = new Set<string>();
  for (const sf of options.subFields) {
    if (sf.inputType === "repeater") {
      throw new Error(
        `repeater("${options.key}") subFields contains a nested repeater ` +
          `("${sf.key}"); nested repeaters are not supported in v0.1.`,
      );
    }
    if (FORBIDDEN_SUBFIELD_KEYS.has(sf.key)) {
      throw new Error(
        `repeater("${options.key}") subField key "${sf.key}" is forbidden ` +
          `(prototype-pollution risk).`,
      );
    }
    if (!REPEATER_SUBFIELD_KEY_RE.test(sf.key)) {
      throw new Error(
        `repeater("${options.key}") subField key "${sf.key}" must match ` +
          `${REPEATER_SUBFIELD_KEY_RE}.`,
      );
    }
    if (seen.has(sf.key)) {
      throw new Error(
        `repeater("${options.key}") declares subField "${sf.key}" more than once.`,
      );
    }
    seen.add(sf.key);
  }
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "repeater",
    subFields: options.subFields,
    min: options.min,
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: walkRepeaterRows(options.subFields, {
      min: options.min,
      max: options.max,
    }),
  };
}
