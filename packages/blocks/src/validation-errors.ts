/**
 * Codes the validator emits today. The union is intentionally narrow
 * — only what's actually produced — so admin clients dispatching on
 * `code` don't get a false sense of coverage. Adding attribute-level
 * validation will widen this union; until then anything beyond
 * `unknown_block_type` / `unknown_mark` would be a lie.
 */
export type BlockContentValidationCode = "unknown_block_type" | "unknown_mark";

export interface BlockContentValidationIssue {
  readonly code: BlockContentValidationCode;
  readonly message: string;
  readonly path: string;
  readonly nodeName?: string;
  readonly attributeName?: string;
  readonly markName?: string;
}
