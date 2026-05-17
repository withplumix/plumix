import type { Editor, JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { FloatingInsertMenu } from "@/editor/floating-menu/FloatingInsertMenu.js";
import { createSlashMenuExtension } from "@/editor/slash-menu/extension.js";
import { cn } from "@/lib/utils.js";
import { EditorContent, useEditor } from "@tiptap/react";

import type { BlockRegistry, MarkRegistry } from "@plumix/blocks";

import { BubbleMenu } from "./bubble-menu/index.js";
import { buildTiptapExtensions } from "./tiptap-extensions.js";

// Two render modes:
//   - canvas mode (no allowlist props): full StarterKit + slash menu +
//     floating insert menu + bubble menu (when registries supplied)
//   - richtext field mode (allowlist props supplied): StarterKit
//     extensions gated by `marks` / `nodes`; no slash/floating menus
//
// The server-side validator (`walkRichtextDoc`) re-checks on save —
// the editor's allowlist is the authoring affordance, the
// renderer's (in `route/render/tiptap.ts`) is the trust boundary.
// `value` is a ProseMirror JSON document.

export function TiptapEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  marks,
  nodes,
  blocks,
  markRegistry,
  blockRegistry,
  onEditorReady,
}: {
  readonly value: JSONContent | null;
  readonly onChange: (json: JSONContent) => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  /**
   * Selection-anchored BubbleMenu renders one button per registered
   * mark when supplied. Filtered against the live editor schema.
   */
  readonly markRegistry?: MarkRegistry;
  /**
   * Slash menu reads from this registry. Required in canvas mode for
   * `/` to insert a block; omit in field mode (no slash menu shown).
   */
  readonly blockRegistry?: BlockRegistry;
  /**
   * Called once with the editor instance after mount, and again with
   * `null` on unmount. Lets the rail Inspector (or future Block menu)
   * subscribe to selection state without prop-drilling the editor
   * down the form tree.
   */
  readonly onEditorReady?: (editor: Editor | null) => void;
}): ReactNode {
  // Shields the `value` sync-effect from echoing the editor's own
  // emissions back through the parent's state — would otherwise
  // fight the caret on every keystroke.
  const lastEmittedRef = useRef<JSONContent | null>(value);

  // `undefined` → canvas mode (full StarterKit). Any defined entry —
  // including an empty array — flips to strict field mode.
  const allowlist = useMemo(
    () =>
      marks === undefined && nodes === undefined && blocks === undefined
        ? undefined
        : { marks, nodes, blocks },
    [marks, nodes, blocks],
  );

  const extensions = useMemo(() => {
    const base = buildTiptapExtensions({ allowlist, blockRegistry });
    // Slash menu is canvas-mode-only; in strict field mode the user
    // already knows what node they're editing.
    if (allowlist || !blockRegistry) return base;
    return [
      ...base,
      createSlashMenuExtension({
        blockRegistry,
        onPick: (item, ed) => {
          // Minimal default: insert the block as an empty node. Block
          // authors can extend by supplying a `defaults` template
          // (wired through in a follow-up slice).
          ed.chain().focus().insertContent({ type: item.name }).run();
        },
      }),
    ];
  }, [allowlist, blockRegistry]);

  const editor = useEditor({
    extensions,
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-40 p-3 focus-visible:outline-none",
        "aria-label": ariaLabel ?? "Entry content",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      lastEmittedRef.current = json;
      onChange(json);
    },
  });

  useEffect(() => {
    if (lastEmittedRef.current === value) return;
    lastEmittedRef.current = value;
    editor.commands.setContent(value);
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Ref-pin the callback so the publish/unpublish effect only fires
  // when the editor instance itself changes (mount/unmount) — not on
  // every parent re-render that might hand us a new inline lambda.
  // Without this, the Inspector context value would flicker null →
  // editor on unrelated re-renders.
  const onEditorReadyRef = useRef(onEditorReady);
  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  });

  useEffect(() => {
    onEditorReadyRef.current?.(editor);
    return () => {
      onEditorReadyRef.current?.(null);
    };
  }, [editor]);

  return (
    <div className={cn("bg-background", disabled && "opacity-60")}>
      {markRegistry ? (
        <BubbleMenu editor={editor} markRegistry={markRegistry} />
      ) : null}
      {!allowlist && blockRegistry ? (
        <FloatingInsertMenu editor={editor} />
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
