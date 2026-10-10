/** Returned rather than asserted, so one run reports every offending file. */
export interface Finding {
  /** Path of the offending file, relative to the content root. */
  readonly file: string;
  /** Stable id of the violated rule, e.g. `page-shape/missing-lede`. */
  readonly rule: string;
  /** What is wrong and what the writer does about it. */
  readonly message: string;
}
