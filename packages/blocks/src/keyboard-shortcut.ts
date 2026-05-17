/**
 * Tiptap accepts modifier expressions like "Mod-b", "Mod-Shift-X",
 * "Shift-Alt-c". Modifier tokens are multi-char capitalized words
 * (Mod, Shift, Alt, Ctrl, Cmd, Meta, Opt); the trailing key is a
 * single alphanumeric. Splitting into two atoms keeps the regex
 * linear — the prior single-alternation form polynomial-backtracked
 * on strings like "A-A-A-…" (CodeQL js/redos).
 *
 * Shared between `defineBlock` and `defineMark` so both surfaces
 * reject the same set of malformed shortcuts at registration time.
 */
export const KEYBOARD_SHORTCUT_PATTERN = /^([A-Z][a-z]+-)+[A-Za-z0-9]$/;
