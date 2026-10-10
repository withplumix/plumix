import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

// Exists only so `lingui extract` sees core's meta constraint message ids.

export const META_FIELD_DESCRIPTORS = {
  required: defineMessage({
    id: "metaField.required",
    message: "This field is required.",
  }),
  invalid: defineMessage({
    id: "metaField.invalid",
    message: "Invalid value.",
  }),
  maxLength: defineMessage({
    id: "metaField.maxLength",
    message: "Must be at most {max} characters.",
  }),
  min: defineMessage({
    id: "metaField.min",
    message: "Must be at least {min}.",
  }),
  max: defineMessage({
    id: "metaField.max",
    message: "Must be at most {max}.",
  }),
  minTemporal: defineMessage({
    id: "metaField.minTemporal",
    message: "Must be on or after {min}.",
  }),
  maxTemporal: defineMessage({
    id: "metaField.maxTemporal",
    message: "Must be on or before {max}.",
  }),
  invalidOption: defineMessage({
    id: "metaField.invalidOption",
    message: "Select a valid option.",
  }),
  invalidEmail: defineMessage({
    id: "metaField.invalidEmail",
    message: "Enter a valid email address.",
  }),
  invalidUrl: defineMessage({
    id: "metaField.invalidUrl",
    message: "Enter a valid URL.",
  }),
  maxItems: defineMessage({
    id: "metaField.maxItems",
    message: "Select at most {max}.",
  }),
  minRows: defineMessage({
    id: "metaField.minRows",
    message: "Add at least {min} row(s).",
  }),
  maxRows: defineMessage({
    id: "metaField.maxRows",
    message: "Use at most {max} row(s).",
  }),
} satisfies Record<string, MessageDescriptor>;
