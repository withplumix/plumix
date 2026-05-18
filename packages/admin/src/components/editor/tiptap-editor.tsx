import type { SlashMenuItem } from "@/editor/slash-menu/items-from-registry.js";
import type { Editor, JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { PlumixDragHandle } from "@/editor/drag-handle/PlumixDragHandle.js";
import { FloatingInsertMenu } from "@/editor/floating-menu/FloatingInsertMenu.js";
import { createSlashMenuExtension } from "@/editor/slash-menu/extension.js";
import { cn } from "@/lib/utils.js";
import { EditorContent, useEditor } from "@tiptap/react";

import type {
  BlockRegistry,
  BlockVariationInnerBlock,
  MarkRegistry,
} from "@plumix/blocks";

import { BubbleMenu } from "./bubble-menu/index.js";
import { buildTiptapExtensions } from "./tiptap-extensions.js";

/**
 * Translate a slash-menu item into Tiptap's `insertContent` payload.
 * Block items insert as a bare empty node of their type; variation
 * items insert the parent block's node type with the variation's
 * preset attrs and the variation's `innerBlocks` template materialised
 * (recursively) as `content`.
 */
export function slashMenuItemToContent(item: SlashMenuItem): JSONContent {
  if (item.parent !== undefined) {
    return {
      type: item.parent,
      ...(item.attributes !== undefined && { attrs: { ...item.attributes } }),
      ...(item.innerBlocks !== undefined &&
        item.innerBlocks.length > 0 && {
          content: item.innerBlocks.map(innerBlockToContent),
        }),
    };
  }
  return { type: item.name };
}

function innerBlockToContent(inner: BlockVariationInnerBlock): JSONContent {
  return {
    type: inner.name,
    ...(inner.attributes !== undefined && { attrs: { ...inner.attributes } }),
    ...(inner.innerBlocks !== undefined &&
      inner.innerBlocks.length > 0 && {
        content: inner.innerBlocks.map(innerBlockToContent),
      }),
  };
}

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
    const base = buildTiptapExtensions({ allowlist, blockRegistry, markRegistry });
    // Slash menu is canvas-mode-only; in strict field mode the user
    // already knows what node they're editing.
    if (allowlist || !blockRegistry) return base;
    return [
      ...base,
      createSlashMenuExtension({
        blockRegistry,
        onPick: (item, ed) => {
          // Variation items carry the parent block's actual Tiptap
          // node type as `item.parent` — `item.name` is the
          // `<parent>:<slug>` composite which is NOT a registered node
          // type. Block items leave `parent` undefined and the block
          // name IS the node type.
          ed.chain().focus().insertContent(slashMenuItemToContent(item)).run();
        },
      }),
    ];
  }, [allowlist, blockRegistry, markRegistry]);

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
    // While the editor has focus the user is the source of truth; a
    // `setContent` here resets ProseMirror's selection + decoration
    // state and notably deactivates the slash-menu suggestion plugin
    // mid-typing. External sync is only meaningful when focus is
    // elsewhere (programmatic field reset, form hydrating a different
    // entry, etc.). RHF re-renders with a fresh `value` reference on
    // every change so the upstream ref check alone is insufficient.
    if (editor.isFocused) return;
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
      {!allowlist && blockRegistry ? (
        <PlumixDragHandle editor={editor} blockRegistry={blockRegistry} />
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
