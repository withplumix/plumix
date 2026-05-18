import type { BlockContentValidationResult } from "./validate-content.js";

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

export class BlockContentValidationError extends Error {
  static {
    BlockContentValidationError.prototype.name = "BlockContentValidationError";
  }

  readonly issues: readonly BlockContentValidationIssue[];

  private constructor(
    message: string,
    issues: readonly BlockContentValidationIssue[],
  ) {
    super(message);
    this.issues = issues;
  }

  static fromIssues(
    issues: readonly BlockContentValidationIssue[],
  ): BlockContentValidationError {
    const summary =
      issues.length === 1
        ? (issues[0]?.message ?? "Block content validation failed")
        : `${issues.length} block content validation issues`;
    return new BlockContentValidationError(summary, issues);
  }

  // Sugar so callers can `if (!r.ok) throw …fromResult(r)` after
  // narrowing once. The parameter only accepts the failure variant —
  // the type system rejects passing an ok result.
  static fromResult(
    result: Extract<BlockContentValidationResult, { ok: false }>,
  ): BlockContentValidationError {
    return BlockContentValidationError.fromIssues(result.errors);
  }
}
