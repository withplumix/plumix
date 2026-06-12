import type { ShortcodeSpec } from "../types.js";
import { yearShortcode } from "./year.js";

/**
 * The built-in shortcodes shipped by `@plumix/blocks`, lowest precedence in
 * the assembled registry (core < plugin < theme). Bare tags only for now.
 */
export const coreShortcodes: readonly ShortcodeSpec[] = Object.freeze([
  yearShortcode,
]);
