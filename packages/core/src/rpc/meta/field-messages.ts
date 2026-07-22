import type { MessageDescriptor } from "@lingui/core";

/**
 * Descriptors behind the constraint walker's `{ path, message }`
 * rejections. Inline literals (not `defineMessage`) because core
 * builds with plain `tsc`, no Lingui macro pass — admin's extraction
 * mirror (`meta-field-i18n.ts`) re-declares these ids for
 * `lingui extract` and a lockstep test guards the pairing.
 *
 * Messages interpolate simple `{name}` placeholders only (no ICU
 * plurals) — the admin resolves them with the descriptor's `values`
 * shipped on the wire, falling back to runtime compilation when an id
 * is missing from the active catalog.
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
