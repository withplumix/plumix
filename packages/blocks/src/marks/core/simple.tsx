import type { ReactElement } from "react";
import { Mark } from "@tiptap/core";

import type { MarkComponent, MarkProps, MarkSpec } from "../types.js";
import { defineMark } from "../define-mark.js";

/**
 * Most marks are zero-attr "wrap children in a fixed HTML element". This
 * helper encodes that pattern once: declare the canonical HTML tag, the
 * parseHTML pattern that absorbs both that tag and any aliases (so pasted
 * `<b>` rolls up into `bold`, etc.), and the React Component is just the
 * tag wrapping children.
 *
 * Mark / spec name are kept identical (`schemaName === spec.name`) so
 * the registry's schemaNameMismatch guard stays satisfied.
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

export function simpleMark(opts: SimpleMarkOptions): MarkSpec {
  const schema = Mark.create({
    name: opts.name,
    parseHTML() {
      return opts.parseTags.map((tag) => ({ tag }));
    },
    renderHTML() {
      return [opts.tag, 0];
    },
  });

  const Component: MarkComponent = ({ children }: MarkProps): ReactElement => {
    const Tag = opts.tag;
    return <Tag>{children}</Tag>;
  };
  Component.displayName = `${opts.name}-mark`;

  return defineMark({
    name: opts.name,
    title: opts.title,
    keyboardShortcut: opts.keyboardShortcut,
    bubbleMenuLabel: opts.bubbleMenuLabel,
    bubbleMenuIcon: opts.bubbleMenuIcon,
    schema: () => Promise.resolve(schema),
    component: () => Promise.resolve(Component),
  });
}
