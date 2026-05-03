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
export { textarea } from "./textarea.js";
export type { TextareaFieldOptions } from "./textarea.js";
export { number } from "./number.js";
export type { NumberFieldOptions } from "./number.js";
export { email } from "./email.js";
export type { EmailFieldOptions } from "./email.js";
export { url } from "./url.js";
export type { UrlFieldOptions } from "./url.js";
export { password } from "./password.js";
export type { PasswordFieldOptions } from "./password.js";
export { date } from "./date.js";
export type { DateFieldOptions } from "./date.js";
export { datetime } from "./datetime.js";
export type { DateTimeFieldOptions } from "./datetime.js";
export { time } from "./time.js";
export type { TimeFieldOptions } from "./time.js";
export { parseMetaDate } from "./parse-date.js";
export { select } from "./select.js";
export type { SelectFieldOptions } from "./select.js";
export { radio } from "./radio.js";
export type { RadioFieldOptions } from "./radio.js";
export { checkbox } from "./checkbox.js";
export type { CheckboxFieldOptions } from "./checkbox.js";
