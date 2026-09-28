import type { ShortcodeSpec } from "../types.js";
import { monthShortcode } from "./month.js";
import { yearShortcode } from "./year.js";

/**
 * The built-in shortcodes shipped in `blocks/`, lowest precedence in
 * the assembled registry (core < plugin < theme).
 */
export const coreShortcodes: readonly ShortcodeSpec[] = Object.freeze([
  yearShortcode,
  monthShortcode,
]);
