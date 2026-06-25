// The heading levels the unified Text block (core/rich-text) supports — the
// single source of truth shared by the Tiptap editor (extension config + format
// control) and the sanitiser allowlist, so the editor can never produce a
// heading the renderer would strip, and vice versa. Capped at h1–h4; h5/h6 are
// intentionally unavailable.
export const HEADING_LEVELS = [1, 2, 3, 4] as const;

export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** The heading tag names (`h1`–`h4`) derived from {@link HEADING_LEVELS}. */
export const HEADING_TAGS: readonly string[] = HEADING_LEVELS.map(
  (level) => `h${level}`,
);
