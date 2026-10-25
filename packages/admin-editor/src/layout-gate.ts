import type { BlockInput, BlockSpec } from "@plumix/core/blocks";
import { isContentInput } from "@plumix/core/blocks";

/**
 * What the writer may do on this entry type, from its `edit_layout`
 * capability. Every control that changes layout asks it; the server enforces
 * the same line on save.
 */
export interface LayoutGate {
  /** Insert, move, duplicate, delete, copy, paste, group and style blocks. */
  readonly editsLayout: boolean;
  /** Whether the inspector offers `input`. */
  offersInput(input: BlockInput): boolean;
  /** Whether a node of `spec` can be selected; `undefined` is unregistered. */
  selects(spec: BlockSpec | undefined): boolean;
}

const FULL_LAYOUT: LayoutGate = {
  editsLayout: true,
  offersInput: () => true,
  selects: () => true,
};

const CONTENT_ONLY: LayoutGate = {
  editsLayout: false,
  offersInput: isContentInput,
  selects: (spec) => (spec?.inputs ?? []).some(isContentInput),
};

export function layoutGate(editsLayout: boolean): LayoutGate {
  return editsLayout ? FULL_LAYOUT : CONTENT_ONLY;
}
