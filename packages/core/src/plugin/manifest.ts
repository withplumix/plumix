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

// The admin editor reads these here because the root barrel pulls the
// request-scoped runtime and crashes at admin module-init.
export type { NamedTemplateChoice } from "../route/contract/named-template.js";
export { NAMED_TEMPLATE_META_KEY } from "../route/contract/named-template.js";
export { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
