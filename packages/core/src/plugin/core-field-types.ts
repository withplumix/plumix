/**
 * Seed set for `mergeBlockRegistry`'s attribute-type validation so
 * core blocks can declare `type: "select"` etc. without registering a
 * plugin. Mirrors the admin `MetaBoxField` dispatcher's native variants
 * plus block-specific aliases (`boolean`, `link`). Plugins extend this
 * via `ctx.registerFieldType`.
 */
export const CORE_FIELD_TYPES: readonly string[] = Object.freeze([
  "text",
  "textarea",
  "number",
  "range",
  "select",
  "multiselect",
  "checkbox",
  "boolean",
  "url",
  "link",
  "email",
  "password",
  "color",
  "date",
  "datetime",
  "time",
  "json",
  "richtext",
  "repeater",
  "entry",
  "entry-list",
  "term",
  "term-list",
  "user",
  "user-list",
  "radio",
]);
