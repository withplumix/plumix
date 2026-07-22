// Typed builder helpers for meta-box field registration. The scalar
// fields (string, numeric, temporal, color, richtext, json) and
// `link` are fluent builders: the constructor takes the key alone and
// every option is a chained call (`text("subtitle").maxLength(120)`,
// `number("rating").min(1).max(5)`), each returning a fresh immutable
// instance that compiles to the narrowed `MetaBoxField` variant at
// registration. The choice and reference factories still take flat
// option objects; they convert to fluent chains ticket by ticket.
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
export { number, NumberFieldBuilder } from "./number.js";
export { date, datetime, TemporalFieldBuilder, time } from "./temporal.js";
export type { TemporalInputType } from "./temporal.js";
export { parseMetaDate } from "./parse-date.js";
export { color, ColorFieldBuilder } from "./color.js";
export { range, RangeFieldBuilder } from "./range.js";
export { multiselect } from "./multiselect.js";
export type { MultiselectFieldOptions } from "./multiselect.js";
export { json, JsonFieldBuilder } from "./json.js";
export { richtext, RichtextFieldBuilder } from "./richtext.js";
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
