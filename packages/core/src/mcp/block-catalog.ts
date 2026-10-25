import type {
  BlockInput,
  BlockInputOption,
  BlockSpec,
} from "../blocks/block-registry.js";
import type {
  AllowCustomStyles,
  StylePolicy,
} from "../blocks/styles/style-policy.js";
import type { AppContext } from "../context/app-context.js";
import {
  styleCategoryForProperty,
  tokenCssVar,
} from "../blocks/styles/style-emitter.js";
import { STYLE_KEYWORDS } from "../blocks/styles/style-policy.js";
import { labelSourceText } from "../i18n/label.js";

type BlockCatalog = Pick<AppContext, "blocks" | "allowedBlocks">;

interface DescribedInput {
  readonly name: string;
  readonly type: string;
  readonly label: string | undefined;
  readonly options: readonly BlockInputOption["value"][] | undefined;
  readonly allowedBlocks: readonly string[] | undefined;
}

interface DescribedBlock {
  readonly name: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly requiresParent: BlockSpec["requiresParent"];
  readonly inputs: readonly DescribedInput[];
  readonly defaultStyles: BlockSpec["defaultStyles"];
}

interface DescribedToken {
  readonly label: string;
  readonly value: string | undefined;
  readonly use: string;
}

interface DescribedStyles {
  readonly allowCustomStyles: AllowCustomStyles;
  readonly keywords: typeof STYLE_KEYWORDS;
  readonly tokens: Record<string, Record<string, DescribedToken>>;
}

function themeAllowedSpecs({
  blocks,
  allowedBlocks,
}: BlockCatalog): BlockSpec[] {
  return [...blocks].filter((spec) => allowedBlocks?.has(spec.name) ?? true);
}

/** A slot whose input lists no `allowedBlocks` accepts any block. */
export function allowedChildren(
  ctx: BlockCatalog,
  parent: string,
  slot: string,
): readonly string[] {
  const input = ctx.blocks
    .get(parent)
    ?.inputs?.find((candidate) => candidate.name === slot);
  const listed = input?.allowedBlocks;
  return themeAllowedSpecs(ctx)
    .filter(
      (spec) =>
        (listed?.includes(spec.name) ?? true) &&
        (spec.requiresParent?.includes(parent) ?? !spec.requiresParent),
    )
    .map((spec) => spec.name);
}

function describeInput(
  ctx: BlockCatalog,
  spec: BlockSpec,
  input: BlockInput,
): DescribedInput {
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

export function describeBlocks(ctx: BlockCatalog): readonly DescribedBlock[] {
  return themeAllowedSpecs(ctx).map((spec) => ({
    name: spec.name,
    title: labelSourceText(spec.title ?? spec.name),
    description: spec.description && labelSourceText(spec.description),
    requiresParent: spec.requiresParent,
    inputs: (spec.inputs ?? []).map((input) => describeInput(ctx, spec, input)),
    defaultStyles: spec.defaultStyles,
  }));
}

export function describeStyles(
  policy: StylePolicy | undefined,
): DescribedStyles {
  const allowCustomStyles = policy?.allowCustomStyles ?? true;
  const tokens: Record<string, Record<string, DescribedToken>> = {};
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

export function allowedTopLevel(ctx: BlockCatalog): readonly string[] {
  return themeAllowedSpecs(ctx)
    .filter((spec) => !spec.requiresParent)
    .map((spec) => spec.name);
}
