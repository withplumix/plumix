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

export * from "@plumix/core/fields";
