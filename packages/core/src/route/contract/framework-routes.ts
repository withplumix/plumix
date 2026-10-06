/**
 * The framework routes a site keeps, keyed by the page kind each family
 * renders. Root pagination is not among them: it is the front page's, and a
 * site always has one. A family set to `false` is never compiled, so its URLs
 * fall through to whatever else matches, or to 404 (ADR 0029).
 */
export interface FrameworkRoutesInput {
  /** `/authors/:slug` and its later pages. Defaults to `true`. */
  readonly author?: boolean;
  /**
   * The year, month and day archives (`/2026`, `/2026/07`, `/2026/07/21`) and
   * their later pages, as one switch. Defaults to `true`.
   */
  readonly date?: boolean;
  /**
   * `/search`, `/search/:query` and its later pages, and with them the 301
   * from `/search?q=` to the path form. Defaults to `true`.
   */
  readonly search?: boolean;
}

/** {@link FrameworkRoutesInput} with every family settled. */
export type FrameworkRoutes = Readonly<
  Record<keyof FrameworkRoutesInput, boolean>
>;

export function resolveFrameworkRoutes(
  input: FrameworkRoutesInput = {},
): FrameworkRoutes {
  return {
    author: input.author ?? true,
    date: input.date ?? true,
    search: input.search ?? true,
  };
}
