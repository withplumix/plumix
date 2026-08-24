/**
 * One content problem in one file. Checks return findings rather than
 * asserting, so a single run reports every offending file at once and fixing
 * content is one pass rather than a queue.
 */
export interface Finding {
  /** Path of the offending file, relative to the content root. */
  readonly file: string;
  /** Stable id of the violated rule, e.g. `page-shape/missing-lede`. */
  readonly rule: string;
  /** What is wrong and what the writer does about it. */
  readonly message: string;
}
