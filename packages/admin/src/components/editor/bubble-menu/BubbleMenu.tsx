import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";

import type { MarkRegistry } from "@plumix/blocks";

import { MarkToolbar } from "./MarkToolbar.js";

interface BubbleMenuProps {
  readonly editor: Editor;
  readonly markRegistry: MarkRegistry;
}

/**
 * Selection-anchored mark toolbar.
 *
 * Tiptap's `BubbleMenu` owns positioning via floating-ui and visibility
 * via selection state; this wrapper just slots the registry-driven
 * `MarkToolbar` into it so the rendering layer stays free of editor
 * lifecycle concerns and can be tested without floating-ui.
 */
export function BubbleMenu({
  editor,
  markRegistry,
}: BubbleMenuProps): ReactElement {
  return (
    <TiptapBubbleMenu editor={editor} data-plumix-bubble-menu="">
      <MarkToolbar editor={editor} markRegistry={markRegistry} />
    </TiptapBubbleMenu>
  );
}
