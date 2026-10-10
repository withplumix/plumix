// Shared by the editor and the sanitiser allowlist so the editor can never
// produce a heading the renderer would strip.
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** The heading tag names (`h1`–`h6`) derived from {@link HEADING_LEVELS}. */
export const HEADING_TAGS: readonly string[] = HEADING_LEVELS.map(
  (level) => `h${level}`,
);
