import type { Node } from "@tiptap/core";
import {
  nodeInputRule,
  textblockTypeInputRule,
  wrappingInputRule,
} from "@tiptap/core";

import type {
  BlockKeyboardShortcut,
  BlockMarkdownShortcut,
  ParsePasteRule,
  ResolvedBlockSpec,
} from "@plumix/blocks";

/**
 * Extends a resolved block's Tiptap Node with the editor-side concerns
 * declared on the spec: keyboard shortcuts, markdown input rules, and
 * paste-parse selectors. Returns the original schema unchanged when no
 * editor-side fields are set so blocks that don't opt in don't pay
 * the wrapping cost.
 *
 * Keyboard shortcuts bind to the canonical "convert current block"
 * command (`setNode(spec.name)`). Markdown input rules attach via the
 * Node's `addInputRules` extension hook; each pattern triggers
 * `setNode(spec.name)` at the start of a textblock. Paste rules merge
 * into the Node's `parseHTML` so pasted DOM elements absorb into the
 * block.
 */
export function wireBlockSpecExtension(spec: ResolvedBlockSpec): Node {
  const base = spec.schema;
  if (
    !spec.keyboardShortcuts?.length &&
    !spec.markdownShortcuts?.length &&
    !spec.parsePaste?.length
  ) {
    return base;
  }

  return base.extend({
    addKeyboardShortcuts() {
      const inherited = this.parent?.() ?? {};
      const map = { ...inherited };
      for (const entry of spec.keyboardShortcuts ?? []) {
        map[entry.shortcut] = () =>
          runShortcutCommand(this.editor, spec.name, entry);
      }
      return map;
    },
    addInputRules() {
      const inherited = this.parent?.() ?? [];
      if (!spec.markdownShortcuts) return inherited;
      const nodeType = this.editor.schema.nodes[spec.name];
      if (!nodeType) return inherited;
      return [
        ...inherited,
        ...spec.markdownShortcuts.map((entry) =>
          buildInputRule(entry, nodeType),
        ),
      ];
    },
    parseHTML() {
      const inherited = this.parent?.() ?? [];
      if (!spec.parsePaste) return inherited;
      return [...inherited, ...spec.parsePaste.map(pasteToParseRule)];
    },
  });
}

function runShortcutCommand(
  editor: { chain(): SimpleChain },
  name: string,
  entry: BlockKeyboardShortcut,
): boolean {
  const chain = editor.chain().focus();
  switch (entry.mode ?? "setNode") {
    case "setNode":
      return chain.setNode(name, entry.attrs).run();
    case "wrap":
      // `wrapIn` is the standard Tiptap command for list-style wrappers.
      return chain.wrapIn(name, entry.attrs).run();
    case "leaf":
      // Inserts the leaf at the current selection; matches the keyboard
      // semantics of `<hr>`/`<spacer>` insertion.
      return chain.insertContent({ type: name, attrs: entry.attrs }).run();
  }
}

interface SimpleChain {
  focus(): SimpleChain;
  setNode(name: string, attrs?: Readonly<Record<string, unknown>>): SimpleChain;
  wrapIn(name: string, attrs?: Readonly<Record<string, unknown>>): SimpleChain;
  insertContent(content: unknown): SimpleChain;
  run(): boolean;
}

interface NodeTypeLike {
  readonly name: string;
}

function buildInputRule(
  entry: BlockMarkdownShortcut,
  nodeType: NodeTypeLike,
): ReturnType<
  | typeof textblockTypeInputRule
  | typeof wrappingInputRule
  | typeof nodeInputRule
> {
  const find = new RegExp(`^${escapeForRegex(entry.pattern)}$`);
  const getAttributes = entry.attrs ? () => entry.attrs ?? null : undefined;
  switch (entry.mode ?? "setNode") {
    case "setNode":
      return textblockTypeInputRule({
        find,
        type: nodeType as never,
        getAttributes,
      });
    case "wrap":
      return wrappingInputRule({
        find,
        type: nodeType as never,
        getAttributes,
      });
    case "leaf":
      return nodeInputRule({
        find,
        type: nodeType as never,
        getAttributes,
      });
  }
}

// `wireMarkSpecExtension` is not implemented in this slice because marks
// aren't loaded into the editor schema yet — that's the broader
// "editor extension list sources from the registry" deferral tracked
// in the project memory. The 5 marks StarterKit ships already carry
// their canonical Cmd-B / Cmd-I / etc. shortcuts; the 8 additional
// marks shipped by @plumix/blocks don't declare shortcuts. When the
// mark-schema loader lands, build the symmetric helper here.

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TiptapParseRule {
  tag: string;
  priority?: number;
  getAttrs?: (el: HTMLElement) => Readonly<Record<string, unknown>> | false;
}

function pasteToParseRule(rule: ParsePasteRule): TiptapParseRule {
  const out: TiptapParseRule = { tag: rule.selector };
  if (rule.priority !== undefined) out.priority = rule.priority;
  if (rule.fromHTML) {
    const fromHTML = rule.fromHTML;
    out.getAttrs = (el) => fromHTML(el) ?? false;
  }
  return out;
}
