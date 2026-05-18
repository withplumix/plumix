import type { Mark as TiptapMarkExtension } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";

import type { LazyRef, ParsePasteRule } from "../types.js";

export interface MarkProps {
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly children: ReactNode;
}

export type MarkComponent = ComponentType<MarkProps>;

export interface MarkSpec {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly keyboardShortcut?: string;
  /** Label shown in the bubble menu button (defaults to `title`). */
  readonly bubbleMenuLabel?: string;
  /** Optional Lucide icon name for the bubble menu button. */
  readonly bubbleMenuIcon?: string;
  readonly schema: LazyRef<ReturnType<typeof TiptapMarkExtension.create>>;
  readonly component: LazyRef<MarkComponent>;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * Tiptap `Mark.create(...)` instance for this mark. Mirrors
   * `BlockSpec.adminSchema`: lets the admin chunk synthesizer wire the
   * mark into the editor's extension list. Core marks leave this unset —
   * the admin imports `@plumix/blocks` directly.
   */
  readonly adminSchema?: string;
  /**
   * Paste rules: HTML selectors this mark absorbs when the editor
   * receives pasted content. Marks usually need only the selector;
   * the editor extension wraps matched ranges with this mark.
   */
  readonly parsePaste?: readonly ParsePasteRule[];
}

export interface ResolvedMarkSpec extends Omit<MarkSpec, "component"> {
  readonly component: MarkComponent;
  readonly registeredBy: string | null;
}

export interface MarkRegistry {
  get(name: string): ResolvedMarkSpec | undefined;
  has(name: string): boolean;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, ResolvedMarkSpec]>;
}
