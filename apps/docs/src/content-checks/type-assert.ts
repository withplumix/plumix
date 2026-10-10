/**
 * The alias declaration itself is the assertion; nothing needs to consume it.
 */
export type Assert<T extends true> = T;

/**
 * Exact type equality, not mutual assignability. Each `<T>()` is deliberately
 * single-use: deferring the conditional is what makes the comparison exact.
 */
export type Equals<A, B> =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
