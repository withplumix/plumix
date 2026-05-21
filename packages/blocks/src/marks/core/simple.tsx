import { Mark } from "@tiptap/core";

import type { MarkSpec } from "../types.js";

/**
 * Most marks are zero-attr "wrap children in a fixed HTML element". This
 * helper encodes that pattern: declare the canonical HTML tag and the
 * parseHTML aliases (so pasted `<b>` rolls up into `bold`, etc.).
 *
 * Schema name and spec name are kept identical — the walker dispatches
 * on `mark.type === schema.name`.
 */
interface SimpleMarkOptions {
  readonly name: string;
  readonly title: string;
  readonly tag: keyof React.JSX.IntrinsicElements;
  readonly parseTags: readonly string[];
  readonly keyboardShortcut?: string;
  readonly bubbleMenuLabel?: string;
  readonly bubbleMenuIcon?: string;
}

export interface SimpleMarkExtensionOptions {
  readonly name: string;
  readonly tag: keyof React.JSX.IntrinsicElements;
  readonly parseTags: readonly string[];
}

export function createSimpleMarkExtension(
  opts: SimpleMarkExtensionOptions,
): ReturnType<typeof Mark.create> {
  return Mark.create({
    name: opts.name,
    parseHTML() {
      return opts.parseTags.map((tag) => ({ tag }));
    },
    renderHTML() {
      return [opts.tag, 0];
    },
  });
}

export function simpleMark(opts: SimpleMarkOptions): MarkSpec {
  return {
    name: opts.name,
    title: opts.title,
    keyboardShortcut: opts.keyboardShortcut,
    bubbleMenuLabel: opts.bubbleMenuLabel,
    bubbleMenuIcon: opts.bubbleMenuIcon,
    schema: createSimpleMarkExtension({
      name: opts.name,
      tag: opts.tag,
      parseTags: opts.parseTags,
    }),
  };
}
