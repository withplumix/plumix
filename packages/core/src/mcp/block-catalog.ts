import type { BlockInput, BlockSpec } from "../blocks/block-registry.js";
import type { StylePolicy } from "../blocks/styles/style-policy.js";
import type { AppContext } from "../context/app-context.js";
import {
  styleCategoryForProperty,
  tokenCssVar,
} from "../blocks/styles/style-emitter.js";
import { STYLE_KEYWORDS } from "../blocks/styles/style-policy.js";
import { labelSourceText } from "../i18n/label.js";

type Catalog = Pick<AppContext, "blocks" | "allowedBlocks">;

/** The blocks the theme allows, in registration order. */
function allowedSpecs({ blocks, allowedBlocks }: Catalog): BlockSpec[] {
  return [...blocks].filter((spec) => allowedBlocks?.has(spec.name) ?? true);
}

/**
 * The blocks a slot accepts: what its input lists (any block when it lists
 * none), minus the ones the theme drops or that sit only under another parent.
 */
export function allowedChildren(
  ctx: Catalog,
  parent: string,
  slot: string,
): readonly string[] {
  const input = ctx.blocks
    .get(parent)
    ?.inputs?.find((candidate) => candidate.name === slot);
  const listed = input?.allowedBlocks;
  return allowedSpecs(ctx)
    .filter(
      (spec) =>
        (listed?.includes(spec.name) ?? true) &&
        (spec.requiresParent?.includes(parent) ?? !spec.requiresParent),
    )
    .map((spec) => spec.name);
}

function describeInput(ctx: Catalog, spec: BlockSpec, input: BlockInput) {
  return {
    name: input.name,
    type: input.type,
    label: input.label && labelSourceText(input.label),
    options: input.options?.map((option) => option.value),
    allowedBlocks:
      input.type === "slot"
        ? allowedChildren(ctx, spec.name, input.name)
        : undefined,
  };
}

/** What an agent may write with: each allowed block's inputs, slots and defaults. */
export function describeBlocks(ctx: Catalog) {
  return allowedSpecs(ctx).map((spec) => ({
    name: spec.name,
    title: labelSourceText(spec.title ?? spec.name),
    description: spec.description && labelSourceText(spec.description),
    requiresParent: spec.requiresParent,
    inputs: (spec.inputs ?? []).map((input) => describeInput(ctx, spec, input)),
    defaultStyles: spec.defaultStyles,
  }));
}

/** The style rule and, by category, the tokens a value must come from. */
export function describeStyles(policy: StylePolicy | undefined) {
  const allowCustomStyles = policy?.allowCustomStyles ?? true;
  const tokens: Record<string, Record<string, unknown>> = {};
  for (const [category, group] of Object.entries(policy?.tokens ?? {})) {
    tokens[category] = Object.fromEntries(
      Object.entries(group ?? {}).map(([id, entry]) => [
        id,
        {
          label: entry.label ?? id,
          value: entry.value,
          use: tokenCssVar(id, category),
        },
      ]),
    );
  }
  return { allowCustomStyles, keywords: STYLE_KEYWORDS, tokens };
}

/** The `var()` literals a property may take, from the category it belongs to. */
export function tokensForProperty(
  policy: StylePolicy | undefined,
  property: string,
): { readonly category: string; readonly uses: readonly string[] } {
  const category = styleCategoryForProperty(property);
  const group = Object.hasOwn(policy?.tokens ?? {}, category)
    ? policy?.tokens[category]
    : undefined;
  return {
    category,
    uses: Object.keys(group ?? {}).map((id) => tokenCssVar(id, category)),
  };
}

/** Every allowed block that can sit at the top level. */
export function allowedTopLevel(ctx: Catalog): readonly string[] {
  return allowedSpecs(ctx)
    .filter((spec) => !spec.requiresParent)
    .map((spec) => spec.name);
}
