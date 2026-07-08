import { Mark } from "@tiptap/core";

export interface SimpleMarkExtensionOptions {
  readonly name: string;
  readonly tag: keyof React.JSX.IntrinsicElements;
  readonly parseTags: readonly string[];
}

/**
 * Most marks are zero-attr "wrap children in a fixed HTML element". This
 * builds the Tiptap extension for that pattern: the canonical HTML tag plus
 * the parseHTML aliases (so pasted `<b>` rolls up into `bold`, etc.).
 *
 * Schema name and spec name are kept identical — the walker dispatches on
 * `mark.type === schema.name`.
 */
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
