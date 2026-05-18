import type { Mark, Node } from "@tiptap/core";
import {
  nodeInputRule,
  textblockTypeInputRule,
  wrappingInputRule,
} from "@tiptap/core";

import type {
  BlockKeyboardShortcut,
  BlockMarkdownShortcut,
  BlockStyleSlot,
  ParsePasteRule,
  ResolvedBlockSpec,
  ResolvedMarkSpec,
} from "@plumix/blocks";
import { resolveBlockStyles } from "@plumix/blocks";

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
    !spec.parsePaste?.length &&
    !spec.supports
  ) {
    return base;
  }

  return base.extend({
    addAttributes() {
      const inherited = (this.parent?.() ?? {}) as Record<string, unknown>;
      // Every block that opts into `supports` accepts a structured
      // `style` slot — the Inspector writes per-axis values here and
      // the SSR walker reads them back. Without this, `updateAttributes`
      // calls from the Inspector are no-ops because the schema doesn't
      // know about the attribute. The per-attribute `renderHTML`
      // resolves the slot into a CSS string + utility class so the
      // editor canvas immediately reflects what the author typed.
      const supports = spec.supports;
      if (!supports) return inherited;
      return {
        ...inherited,
        style: {
          default: null,
          renderHTML: (attrs: { readonly style?: BlockStyleSlot | null }) => {
            const slot = attrs.style;
            if (!slot) return {};
            const resolved = resolveBlockStyles(slot, supports, {});
            const out: Record<string, string> = {};
            if (resolved.id !== undefined) out.id = resolved.id;
            if (resolved.className.length > 0) out.class = resolved.className;
            const styleEntries = Object.entries(resolved.style);
            if (styleEntries.length > 0) {
              out.style = styleEntries
                .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
                .join("; ");
            }
            return out;
          },
          // HTML round-trip intentionally drops the slot: we serialise
          // it as plain inline `style`/`class` so the editor renders
          // correctly, but recovering structured slot data from a CSS
          // string isn't trivial and the JSON path (`getJSON`/
          // `setContent`) preserves it. Known limitation for copy/paste
          // *between* editors.
          parseHTML: () => null,
        },
      };
    },
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

/**
 * Symmetric to {@link wireBlockSpecExtension} for marks: extends the base
 * Mark with the editor-side concerns declared on the spec (keyboard
 * shortcut, paste rules). Marks have no markdown-input-rule surface —
 * Tiptap's mark input rules attach to surrounding text, not the mark
 * itself, and would belong on the host block.
 */
export function wireMarkSpecExtension(spec: ResolvedMarkSpec): Mark {
  const base = spec.schema;
  if (spec.keyboardShortcut === undefined && !spec.parsePaste?.length) {
    return base;
  }
  return base.extend({
    addKeyboardShortcuts() {
      const inherited = this.parent?.() ?? {};
      if (spec.keyboardShortcut === undefined) return inherited;
      return {
        ...inherited,
        [spec.keyboardShortcut]: () =>
          this.editor.chain().focus().toggleMark(spec.name).run(),
      };
    },
    parseHTML() {
      const inherited = this.parent?.() ?? [];
      if (!spec.parsePaste) return inherited;
      return [...inherited, ...spec.parsePaste.map(pasteToParseRule)];
    },
  });
}

function camelToKebab(input: string): string {
  // CSS custom properties (`--foo`) are already kebab-case + leading
  // dashes; the camelCase transform would mangle them.
  if (input.startsWith("--")) return input;
  return input.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

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
