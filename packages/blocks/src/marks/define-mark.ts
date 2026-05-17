import type { MarkSpec } from "./types.js";
import { MarkRegistrationError } from "./errors.js";

const MARK_NAME_PATTERN = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/;
// Tiptap accepts modifier expressions like "Mod-b", "Mod-Shift-X",
// "Shift-Alt-c". Modifier tokens are multi-char capitalized words
// (Mod, Shift, Alt, Ctrl, Cmd, Meta, Opt); the trailing key is a
// single alphanumeric. Splitting into two atoms keeps the regex
// linear — the prior single-alternation form polynomial-backtracked
// on strings like "A-A-A-…" (CodeQL js/redos).
const KEYBOARD_SHORTCUT_PATTERN = /^([A-Z][a-z]+-)+[A-Za-z0-9]$/;

/**
 * Validates a mark spec at registration time and returns a frozen copy.
 * Mirrors `defineBlock`'s shape so plugin authors only learn one
 * pattern. Validation is strict at the boundary — invalid specs throw
 * `MarkRegistrationError` with a discriminated `code`.
 */
export function defineMark(spec: MarkSpec): MarkSpec {
  const name = typeof spec.name === "string" ? spec.name : String(spec.name);
  if (name.length === 0 || !MARK_NAME_PATTERN.test(name)) {
    throw MarkRegistrationError.invalidNamePattern({
      name,
      pattern: MARK_NAME_PATTERN.source,
    });
  }
  if (
    spec.keyboardShortcut !== undefined &&
    !KEYBOARD_SHORTCUT_PATTERN.test(spec.keyboardShortcut)
  ) {
    throw MarkRegistrationError.invalidKeyboardShortcut({
      name: spec.name,
      keyboardShortcut: spec.keyboardShortcut,
    });
  }
  return Object.freeze({ ...spec });
}
