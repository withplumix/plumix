// Public surface for typed meta-box field builder helpers — re-exports
// `@plumix/core/fields` so plugin authors can `import { text } from
// "plumix/fields"` without reaching into the workspace-internal scope.
//
// The scalar fields are fluent builders whose chains expose only the
// options that apply to the underlying renderer
// (`text("subtitle").maxLength(120)`, `number("rating").min(1).max(5)`
// — `number(...).maxLength(...)` is a compile error); the choice and
// reference factories still take flat options. Both register anywhere
// a `fields` array is accepted.

export * from "@plumix/core/fields";
