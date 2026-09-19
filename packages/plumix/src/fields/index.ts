// Public surface for typed meta-box field builder helpers — re-exports
// `@plumix/core/fields` so plugin authors can `import { text } from
// "plumix/fields"` without reaching into the workspace-internal scope.
//
// The scalar fields, `link`, the choice field
// (`select("size").options(["s", "m"])` — `.multiple()` for arrays,
// `.appearance()` for the control), and the boolean switch
// (`toggle("featured")`) are fluent builders whose chains expose only
// the options that apply to the underlying renderer
// (`number(...).maxLength(...)` is a compile error); the reference
// factories still take flat options. Both register anywhere a
// `fields` array is accepted.

export type * from "@plumix/core/fields";
export type {
  CanonicalMetaBoxField,
  ColorMetaBoxField,
  DateMetaBoxField,
  DateTimeMetaBoxField,
  EmailMetaBoxField,
  EntryListMetaBoxField,
  EntryReferenceMetaBoxField,
  GroupMetaBoxField,
  JsonMetaBoxField,
  LegacyMetaBoxField,
  LinkMetaBoxField,
  MediaListMetaBoxField,
  MediaMetaBoxField,
  MetaBoxFieldBase,
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  MetaScalarType,
  MultiSelectMetaBoxField,
  NumberMetaBoxField,
  PasswordMetaBoxField,
  RangeMetaBoxField,
  ReferenceReadProjection,
  ReferenceTarget,
  RepeaterDialogSize,
  RepeaterLayout,
  RepeaterMetaBoxField,
  RichtextMetaBoxField,
  SelectAppearance,
  SelectMetaBoxField,
  SingleSelectMetaBoxField,
  StringMetaBoxField,
  TemporalMetaBoxField,
  TermListMetaBoxField,
  TermReferenceMetaBoxField,
  TextareaMetaBoxField,
  TextMetaBoxField,
  TimeMetaBoxField,
  ToggleMetaBoxField,
  UrlMetaBoxField,
  UserListMetaBoxField,
  UserMetaBoxField,
} from "@plumix/core";

// The builders, and the classes a plugin extends to add a field of its own.
export {
  color,
  ColorFieldBuilder,
  date,
  datetime,
  email,
  entry,
  FieldConfigError,
  group,
  GroupFieldBuilder,
  GroupFieldSeed,
  json,
  JsonFieldBuilder,
  link,
  LinkFieldBuilder,
  number,
  NumberFieldBuilder,
  password,
  range,
  RangeFieldBuilder,
  RangeFieldSeed,
  ReferenceFieldBuilder,
  repeater,
  RepeaterFieldBuilder,
  RepeaterFieldSeed,
  richtext,
  RichtextFieldBuilder,
  select,
  SelectFieldBuilder,
  SelectFieldSeed,
  StringFieldBuilder,
  TemporalFieldBuilder,
  term,
  text,
  textarea,
  time,
  toggle,
  ToggleFieldBuilder,
  url,
  user,
} from "@plumix/core/fields";

// Compiling, projecting and checking a fields array a plugin renders itself, and
// reading a stored date back.
export {
  assertMetaBoxFields,
  compileMetaBoxFields,
  isFieldVisible,
  parseMetaDate,
  toMetaBoxFieldEntry,
} from "@plumix/core/fields";

// The input-type rosters, per family and combined.
export {
  CANONICAL_INPUT_TYPES,
  CHOICE_INPUT_TYPES,
  LEGACY_INPUT_TYPES,
  REFERENCE_INPUT_TYPES,
  SCALAR_INPUT_TYPES,
  STRING_INPUT_TYPES,
  STRUCTURAL_INPUT_TYPES,
  TEMPORAL_INPUT_TYPES,
} from "@plumix/core/fields";
