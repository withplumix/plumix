import type { MessageDescriptor } from "@lingui/core";

/**
 * Inline literals, not `defineMessage`: core builds with plain `tsc` and no
 * Lingui macro pass. Placeholders are simple `{name}` only, no ICU plurals.
 */
export const META_FIELD_MESSAGES = {
  required: {
    id: "metaField.required",
    message: "This field is required.",
  },
  invalid: {
    id: "metaField.invalid",
    message: "Invalid value.",
  },
  maxLength: {
    id: "metaField.maxLength",
    message: "Must be at most {max} characters.",
  },
  min: {
    id: "metaField.min",
    message: "Must be at least {min}.",
  },
  max: {
    id: "metaField.max",
    message: "Must be at most {max}.",
  },
  minTemporal: {
    id: "metaField.minTemporal",
    message: "Must be on or after {min}.",
  },
  maxTemporal: {
    id: "metaField.maxTemporal",
    message: "Must be on or before {max}.",
  },
  invalidOption: {
    id: "metaField.invalidOption",
    message: "Select a valid option.",
  },
  invalidEmail: {
    id: "metaField.invalidEmail",
    message: "Enter a valid email address.",
  },
  invalidUrl: {
    id: "metaField.invalidUrl",
    message: "Enter a valid URL.",
  },
  maxItems: {
    id: "metaField.maxItems",
    message: "Select at most {max}.",
  },
  minRows: {
    id: "metaField.minRows",
    message: "Add at least {min} row(s).",
  },
  maxRows: {
    id: "metaField.maxRows",
    message: "Use at most {max} row(s).",
  },
} satisfies Record<string, MessageDescriptor>;
