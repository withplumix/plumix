// Public surface for typed meta-box field builder helpers — re-exports
// `@plumix/core/fields` so plugin authors can `import { text } from
// "plumix/fields"` without reaching into the workspace-internal scope.
//
// The string scalar fields are fluent builders
// (`text("subtitle").maxLength(120)`); the remaining factories narrow
// their flat options to those that apply to the underlying renderer
// (e.g. `number({ maxLength: 5 })` is rejected at compile time). Both
// register anywhere a `fields` array is accepted.

export * from "@plumix/core/fields";
