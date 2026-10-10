import { Mark } from "@tiptap/core";

export interface SimpleMarkExtensionOptions {
  readonly name: string;
  readonly tag: keyof React.JSX.IntrinsicElements;
  readonly parseTags: readonly string[];
  /** Tiptap chord ("Mod-b"), from the mark's `coreMarks` entry. */
  readonly keyboardShortcut?: string;
}

/**
 * Schema name equals spec name because the walker dispatches on
 * `mark.type === schema.name`.
 */
export function createSimpleMarkExtension(
  opts: SimpleMarkExtensionOptions,
): ReturnType<typeof Mark.create> {
  return Mark.create({
    name: opts.name,
    addKeyboardShortcuts() {
      if (opts.keyboardShortcut === undefined) return {};
      return {
        [opts.keyboardShortcut]: () =>
          this.editor.commands.toggleMark(opts.name),
      };
    },
    parseHTML() {
      return opts.parseTags.map((tag) => ({ tag }));
    },
    renderHTML() {
      return [opts.tag, 0];
    },
  });
}
