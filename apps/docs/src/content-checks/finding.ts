/**
 * One content problem on one page. Checks return findings rather than
 * asserting, so a single run reports every offending page at once and fixing
 * content is one pass rather than a queue.
 */
export interface Finding {
  /** Path of the offending page, relative to the content root. */
  readonly page: string;
  /** Stable id of the violated rule, e.g. `page-shape/missing-lede`. */
  readonly rule: string;
  /** What is wrong and what the writer does about it. */
  readonly message: string;
}
