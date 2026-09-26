// Public `@plumix/core/manifest` barrel. The plugin manifest is split by
// consumer: the meta-box field vocabulary lives beside its builders in
// `fields/meta-box-field.ts`, its per-field wire projection in
// `fields/manifest-entry.ts`, the runtime registry container in `registry.ts`,
// the admin-facing wire types and pure helpers in `manifest-types.ts`, the
// plugin catalog path pair in `plugin-catalog-path.ts`, the build-time
// projection in `build-manifest.ts`, and the HTML `<script>` transport in
// `manifest-script.ts`. This module re-exports them all, so splitting the
// implementation never moves a public name.

export * from "./fields/manifest-entry.js";
export * from "./fields/meta-box-field.js";
export * from "./registry.js";
export * from "./manifest-types.js";
export * from "./plugin-catalog-path.js";
export * from "./build-manifest.js";
export * from "./manifest-script.js";

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
