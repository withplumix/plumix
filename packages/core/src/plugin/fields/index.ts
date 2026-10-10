// Published so a plugin rendering its own fields doesn't reimplement the
// compile, check and project steps every `register*MetaBox` surface runs.
export { compileMetaBoxFields } from "./meta-box-field.js";
export { assertMetaBoxFields } from "../validation/meta-box-fields.js";
export type {
  FieldBuilder,
  MetaBoxField,
  MetaBoxFieldInput,
} from "./meta-box-field.js";
export { toMetaBoxFieldEntry } from "./manifest-entry.js";
export type { MetaBoxFieldManifestEntry } from "./manifest-entry.js";
export {
  CANONICAL_INPUT_TYPES,
  CHOICE_INPUT_TYPES,
  LEGACY_INPUT_TYPES,
  REFERENCE_INPUT_TYPES,
  SCALAR_INPUT_TYPES,
  STRING_INPUT_TYPES,
  STRUCTURAL_INPUT_TYPES,
  TEMPORAL_INPUT_TYPES,
} from "./roster.js";
export { isFieldVisible } from "./condition.js";
export type {
  MetaFieldCondition,
  MetaFieldConditionOperator,
  MetaFieldConditionRule,
  MetaFieldValues,
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
export { range, RangeFieldBuilder, RangeFieldSeed } from "./range.js";
export { json, JsonFieldBuilder } from "./json.js";
export { richtext, RichtextFieldBuilder } from "./richtext.js";
export {
  repeater,
  RepeaterFieldBuilder,
  RepeaterFieldSeed,
} from "./repeater.js";
export { group, GroupFieldBuilder, GroupFieldSeed } from "./group.js";
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
// What a builder throws on a chain that can never register — a plugin's own
// builder raises the same class, so a caller catches one type.
export { FieldConfigError } from "./errors.js";
