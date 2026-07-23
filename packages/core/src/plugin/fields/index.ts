// Typed builder helpers for meta-box field registration. The scalar
// fields (string, numeric, temporal, color, richtext, json), `link`,
// the choice field (`select` — `.multiple()` for arrays,
// `.appearance()` for the control), the boolean switch (`toggle`), and
// the reference fields (`entry` / `term` / `user` — `.multiple()` for
// id arrays, `.returns("id")` to opt out of read-time hydration) are
// fluent builders: the constructor takes the key (plus a required
// scope for `entry` / `term`) and every option is a chained call
// (`text("subtitle").maxLength(120)`, `entry("hero", ["post"]).required()`),
// each returning a fresh immutable instance that compiles to the
// narrowed `MetaBoxField` variant at registration.
//
// Re-exported as a public surface from `plumix/fields`.

export { isFieldVisible } from "./condition.js";
export type {
  MetaFieldCondition,
  MetaFieldConditionOperator,
  MetaFieldConditionRule,
} from "./condition.js";
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
export { json, JsonFieldBuilder } from "./json.js";
export { richtext, RichtextFieldBuilder } from "./richtext.js";
export { repeater } from "./repeater.js";
export type { RepeaterFieldOptions } from "./repeater.js";
export { select, SelectFieldBuilder, SelectFieldSeed } from "./select.js";
export type { SelectOptionInput } from "./select.js";
export { toggle, ToggleFieldBuilder } from "./toggle.js";
export { ReferenceFieldBuilder } from "./reference.js";
export { user } from "./user.js";
export type { UserFieldScope } from "./user.js";
export { entry } from "./entry.js";
export type { EntryFieldScope } from "./entry.js";
export { term } from "./term.js";
export type { TermFieldScope } from "./term.js";
