// Typed builder helpers for meta-box field registration. The string
// scalar fields (`text`, `textarea`, `email`, `url`, `password`) and
// `link` are fluent builders: the constructor takes the key alone and
// every option is a chained call (`text("subtitle").maxLength(120)`), each
// returning a fresh immutable instance that compiles to the narrowed
// `MetaBoxField` variant at registration. The remaining factories
// still take flat option objects, each returning the narrowed variant
// matching its input type — `number({ maxLength: 5 })` is a compile
// error. They convert to fluent chains ticket by ticket.
//
// Re-exported as a public surface from `plumix/fields`.

export {
  email,
  password,
  StringFieldBuilder,
  text,
  textarea,
  url,
} from "./builder.js";
export type { StringInputType } from "./builder.js";
export { link, LinkFieldBuilder } from "./link.js";
export type { LinkValue } from "./link.js";
export { number } from "./number.js";
export type { NumberFieldOptions } from "./number.js";
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
export { repeater } from "./repeater.js";
export type { RepeaterFieldOptions } from "./repeater.js";
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
