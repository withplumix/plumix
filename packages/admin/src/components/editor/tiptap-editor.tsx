import type { JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils.js";
import { EditorContent, useEditor } from "@tiptap/react";

import { buildTiptapExtensions } from "./tiptap-extensions.js";
import { TiptapToolbar } from "./tiptap-toolbar.js";

// Two render modes:
//   - canvas mode (no allowlist props): legacy entry-content editor —
//     full StarterKit + every toolbar button
//   - richtext field mode (allowlist props supplied): StarterKit
//     extensions and toolbar buttons gated by `marks` / `nodes`
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
}: {
  readonly value: JSONContent | null;
  readonly onChange: (json: JSONContent) => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}): ReactNode {
  // Shields the `value` sync-effect from echoing the editor's own
  // emissions back through the parent's state — would otherwise
  // fight the caret on every keystroke.
  const lastEmittedRef = useRef<JSONContent | null>(value);

  // `undefined` → canvas mode (full StarterKit). Any defined entry —
  // including an empty array — flips to strict field mode.
  const allowlist =
    marks === undefined && nodes === undefined && blocks === undefined
      ? undefined
      : { marks, nodes, blocks };

  const editor = useEditor({
    extensions: buildTiptapExtensions(allowlist),
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

  return (
    <div className={cn("bg-background", disabled && "opacity-60")}>
      <TiptapToolbar
        editor={editor}
        disabled={disabled}
        allowlist={allowlist}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
