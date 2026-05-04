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
export { color } from "./color.js";
export type { ColorFieldOptions } from "./color.js";
export { range } from "./range.js";
export type { RangeFieldOptions } from "./range.js";
export { multiselect } from "./multiselect.js";
export type { MultiselectFieldOptions } from "./multiselect.js";
export { json } from "./json.js";
export type { JsonFieldOptions } from "./json.js";
export { richtext } from "./richtext.js";
export type { RichtextFieldOptions } from "./richtext.js";
export { select } from "./select.js";
export type { SelectFieldOptions } from "./select.js";
export { radio } from "./radio.js";
export type { RadioFieldOptions } from "./radio.js";
export { checkbox } from "./checkbox.js";
export type { CheckboxFieldOptions } from "./checkbox.js";
export { user } from "./user.js";
export type { UserFieldOptions, UserFieldScope } from "./user.js";
export { userList } from "./user-list.js";
export type { UserListFieldOptions } from "./user-list.js";
export { entry } from "./entry.js";
export type { EntryFieldOptions, EntryFieldScope } from "./entry.js";
export { entryList } from "./entry-list.js";
export type { EntryListFieldOptions } from "./entry-list.js";
export { term } from "./term.js";
export type { TermFieldOptions, TermFieldScope } from "./term.js";
export { termList } from "./term-list.js";
export type { TermListFieldOptions } from "./term-list.js";
