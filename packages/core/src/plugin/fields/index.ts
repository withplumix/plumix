// Typed builder helpers for meta-box field registration. Each builder
// returns the narrowed variant of `MetaBoxField` matching its input
// type (e.g. `text()` → `TextMetaBoxField`), so the rest of the field
// schema is type-checked against options that actually apply to the
// renderer — `text({ min: 5 })` is a compile error.
//
// Builders are the recommended path for plugin authors going forward;
// existing object-literal registrations continue to compile against
// the broad `LegacyMetaBoxField` shape during the migration window.
//
// Re-exported as a public surface from `plumix/fields`.

export { text } from "./text.js";
export type { TextFieldOptions } from "./text.js";
