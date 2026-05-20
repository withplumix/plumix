import type { JSX } from "react";

import type { SimpleMarkExtensionOptions } from "./simple.js";

// Canonical config for marks that map a name to a single HTML tag.
// Drives `coreMarks` (full MarkSpec registry entries), the synchronous
// `coreMarkExtensions` array consumed by Puck's richtext field, and
// the walker's `mark.type → tag` lookup. Keeping all three in lock-
// step from one source is what stops the lists from drifting.
export const SIMPLE_MARK_CONFIGS: readonly SimpleMarkExtensionOptions[] = [
  { name: "bold", tag: "strong", parseTags: ["strong", "b"] },
  { name: "italic", tag: "em", parseTags: ["em", "i"] },
  { name: "strike", tag: "s", parseTags: ["s", "del", "strike"] },
  { name: "code", tag: "code", parseTags: ["code"] },
  { name: "underline", tag: "u", parseTags: ["u"] },
  { name: "subscript", tag: "sub", parseTags: ["sub"] },
  { name: "superscript", tag: "sup", parseTags: ["sup"] },
  { name: "highlight", tag: "mark", parseTags: ["mark"] },
  { name: "kbd", tag: "kbd", parseTags: ["kbd"] },
  { name: "cite", tag: "cite", parseTags: ["cite"] },
  { name: "small", tag: "small", parseTags: ["small"] },
];

export const SIMPLE_MARK_TAGS: Readonly<
  Record<string, keyof JSX.IntrinsicElements>
> = Object.fromEntries(SIMPLE_MARK_CONFIGS.map((c) => [c.name, c.tag]));
