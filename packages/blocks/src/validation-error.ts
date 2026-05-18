import type { BlockContentValidationResult } from "./validate-content.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";

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
