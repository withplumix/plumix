// Public `@plumix/core/manifest` barrel. The plugin manifest was split along
// its two timelines: the meta-box field vocabulary lives beside its builders in
// `fields/meta-box-field.ts`, its per-field wire projection in
// `fields/manifest-entry.ts`, the runtime registry container in `registry.ts`,
// and the build-time projection in `manifest-projection.ts`. This module
// re-exports all four, so splitting the implementation never moves a public
// name.

export * from "./fields/manifest-entry.js";
export * from "./fields/meta-box-field.js";
export * from "./registry.js";
export * from "./manifest-projection.js";

// Conditional-visibility rule model + evaluator — the wire shape carries these;
// the admin evaluates them via this subpath.
export type {
  MetaFieldCondition,
  MetaFieldConditionOperator,
  MetaFieldConditionRule,
} from "./fields/condition.js";
export { isFieldVisible } from "./fields/condition.js";

// Re-exported on the manifest subpath so the precompiled admin editor can read
// the reserved key without reaching through the root barrel (which pulls the
// request-scoped runtime and crashes at admin module-init).
export type { NamedTemplateChoice } from "../route/render/template-builders.js";
export { NAMED_TEMPLATE_META_KEY } from "../route/render/template-builders.js";
export { ACCESS_POLICY_META_KEY } from "../access/meta-key.js";
