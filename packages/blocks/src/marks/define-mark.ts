import type { MarkSpec } from "./types.js";
import { KEYBOARD_SHORTCUT_PATTERN } from "../keyboard-shortcut.js";
import { MarkRegistrationError } from "./errors.js";

const MARK_NAME_PATTERN = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/;

/**
 * Validates a mark spec at registration time and returns a frozen copy.
 * Mirrors `defineBlock`'s shape so plugin authors only learn one
 * pattern. Validation is strict at the boundary — invalid specs throw
 * `MarkRegistrationError` with a discriminated `code`.
 */
export function defineMark(spec: MarkSpec): MarkSpec {
  if (!MARK_NAME_PATTERN.test(spec.name)) {
    throw MarkRegistrationError.invalidNamePattern({
      name: spec.name,
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
