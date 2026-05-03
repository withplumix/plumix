// Public surface for typed meta-box field builder helpers — re-exports
// `@plumix/core/fields` so plugin authors can `import { text } from
// "plumix/fields"` without reaching into the workspace-internal scope.
//
// Builders narrow their input options to those that apply to the
// underlying renderer (e.g. `text({ min: 5 })` is rejected at compile
// time) and produce values assignable to `MetaBoxField`.

export * from "@plumix/core/fields";
