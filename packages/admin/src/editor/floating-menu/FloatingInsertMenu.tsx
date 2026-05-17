import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import { FloatingMenu as TiptapFloatingMenu } from "@tiptap/react/menus";

interface InsertButtonProps {
  readonly editor: Editor;
}

/**
 * Extracted from `FloatingInsertMenu` so it's unit-testable without
 * mounting Tiptap's positioning machinery (which requires a live editor
 * + ProseMirror state and is brittle in jsdom). Click inserts `/`,
 * triggering the slash-menu suggestion plugin.
 */
export function InsertButton({ editor }: InsertButtonProps): ReactElement {
  return (
    <button
      type="button"
      data-testid="floating-insert-menu"
      aria-label="Insert block"
      onClick={() => editor.chain().focus().insertContent("/").run()}
    >
      +
    </button>
  );
}

interface FloatingInsertMenuProps {
  readonly editor: Editor;
}

export function FloatingInsertMenu({
  editor,
}: FloatingInsertMenuProps): ReactElement {
  return (
    <TiptapFloatingMenu editor={editor}>
      <InsertButton editor={editor} />
    </TiptapFloatingMenu>
  );
}
