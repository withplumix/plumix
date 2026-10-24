import type {
  BlockNode,
  ResponsiveStyleSlot,
  StyleBucketName,
  StylePolicy,
} from "@plumix/core/blocks";
import {
  allowsCustomStyles,
  forbiddenStyles,
  styleCategoryForProperty,
} from "@plumix/core/blocks";

export interface RefusedStyle {
  readonly property: string;
  readonly value: string;
}

/** What the Styles tab may offer for one block at one breakpoint. */
export interface StylePolicyView {
  /** Whether `property` takes custom values, or only tokens and keywords. */
  allowsCustom(property: string): boolean;
  /** Raw CSS declarations and class names. */
  readonly allowsRawCss: boolean;
  /** The stored values at this breakpoint the policy refuses. */
  readonly refused: readonly RefusedStyle[];
  readonly forbiddenClassName: string | undefined;
}

export const PERMISSIVE_STYLE_POLICY_VIEW: StylePolicyView = {
  allowsCustom: () => true,
  allowsRawCss: true,
  refused: [],
  forbiddenClassName: undefined,
};

/** Reads `forbiddenStyles`, the rule the server applies, for one block. */
export function stylePolicyView(
  policy: StylePolicy,
  block: Pick<BlockNode, "style" | "className">,
  spec: { readonly defaultStyles?: ResponsiveStyleSlot } | undefined,
  bucket: StyleBucketName,
): StylePolicyView {
  const refused: RefusedStyle[] = [];
  let forbiddenClassName: string | undefined;
  for (const found of forbiddenStyles(block, policy, spec)) {
    if (found.kind === "className") {
      forbiddenClassName = found.value;
    } else if (found.bucket === bucket) {
      refused.push({ property: found.property, value: found.value });
    }
  }
  return {
    allowsCustom: (property) =>
      allowsCustomStyles(policy, styleCategoryForProperty(property)),
    allowsRawCss: allowsCustomStyles(policy),
    refused,
    forbiddenClassName,
  };
}
