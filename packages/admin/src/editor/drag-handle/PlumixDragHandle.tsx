import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.js";
import { DragHandle } from "@tiptap/extension-drag-handle-react";

import type { BlockRegistry, BlockTransformTo } from "@plumix/blocks";

import { BlockMenu } from "../block-menu/BlockMenu.js";
import { DragHandleButton } from "./DragHandleButton.js";

interface PlumixDragHandleProps {
  readonly editor: Editor;
  readonly blockRegistry: BlockRegistry;
}

interface TrackedNode {
  readonly node: {
    readonly type: { readonly name: string };
    readonly nodeSize: number;
    toJSON(): unknown;
  };
  readonly pos: number;
}

interface OnNodeChangeArgs {
  readonly node: TrackedNode["node"] | null;
  readonly pos: number;
}

/**
 * Selection-anchored drag handle. The first-party Tiptap drag handle
 * owns the floating positioning and the drag-and-drop machinery; this
 * wrapper supplies the visible handle UI + the BlockMenu popover that
 * opens on click.
 *
 * `trackedNode` mirrors the node the handle is currently anchored to
 * so BlockMenu actions know which block to act on (Tiptap's
 * `chain().setNodeSelection(pos)` then runs against the right pos).
 */
export function PlumixDragHandle({
  editor,
  blockRegistry,
}: PlumixDragHandleProps): ReactElement {
  // Structural shape rather than naming PMNode — `@tiptap/pm` isn't a
  // direct admin dep and pulling it in just for this type would bloat
  // the dependency surface. The fields we touch (type.name, nodeSize,
  // toJSON) are the only contract this component relies on.
  const [tracked, setTracked] = useState<TrackedNode | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * Every BlockMenu action selects the tracked node first so the
   * subsequent command runs against the right pos. Guards against
   * stale `tracked` state — Tiptap's `onNodeChange` may not fire
   * before the popover re-opens after a delete, so we re-validate
   * that the position still holds the node we recorded.
   */
  const runWithSelection = (mutate: () => void): void => {
    if (!tracked) return;
    const liveNode = editor.state.doc.nodeAt(tracked.pos);
    if (liveNode?.type.name !== tracked.node.type.name) {
      setTracked(null);
      setOpen(false);
      return;
    }
    editor.chain().focus().setNodeSelection(tracked.pos).run();
    mutate();
    setOpen(false);
  };

  const onTransform = (entry: BlockTransformTo): void => {
    runWithSelection(() => {
      const currentAttrs = tracked
        ? ((tracked.node as { attrs?: Readonly<Record<string, unknown>> })
            .attrs ?? {})
        : {};
      const attrs = entry.mapAttrs ? entry.mapAttrs(currentAttrs) : undefined;
      const chain = editor.chain().focus();
      switch (entry.mode ?? "setNode") {
        case "setNode":
          chain.setNode(entry.target, attrs).run();
          break;
        case "wrap":
          chain.wrapIn(entry.target, attrs).run();
          break;
        case "leaf":
          chain.insertContent({ type: entry.target, attrs }).run();
          break;
      }
    });
  };

  const onDuplicate = (): void => {
    runWithSelection(() => {
      if (!tracked) return;
      const json = tracked.node.toJSON() as Parameters<
        typeof editor.commands.insertContentAt
      >[1];
      editor
        .chain()
        .focus()
        .insertContentAt(tracked.pos + tracked.node.nodeSize, json)
        .run();
    });
  };

  const onDelete = (): void => {
    runWithSelection(() => {
      editor.chain().focus().deleteSelection().run();
      // The recorded position now points at content that may have
      // shifted up; drop the stale ref so a re-opened menu starts fresh.
      setTracked(null);
    });
  };

  const onCopyJson = (): void => {
    if (!tracked) return;
    const json = JSON.stringify(tracked.node.toJSON(), null, 2);
    navigator.clipboard.writeText(json).catch((error: unknown) => {
      // Clipboard rejects on insecure origin, permission denial, or
      // focus loss. Surface the failure so silent loss doesn't leave
      // the author wondering why nothing was copied. The toast layer
      // is out of scope for this slice; until then, console is the
      // minimum acceptable bar.
      console.error("[plumix:block-menu] Copy to clipboard failed:", error);
    });
    setOpen(false);
  };

  // Pinned identity: `DragHandle` lists `onNodeChange` in its effect
  // deps, so a fresh callback per render re-registers the ProseMirror
  // plugin and tears down the slash-menu mount mid-typing (#342).
  const onNodeChange = useCallback(
    ({ node, pos }: OnNodeChangeArgs) => {
      setTracked(node ? { node, pos } : null);
    },
    [],
  );

  return (
    <DragHandle editor={editor} onNodeChange={onNodeChange}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <DragHandleButton onOpenMenu={() => setOpen(true)} />
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-56 p-0">
          {tracked ? (
            <BlockMenu
              sourceName={tracked.node.type.name}
              blockRegistry={blockRegistry}
              onTransform={onTransform}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onCopyJson={onCopyJson}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </DragHandle>
  );
}
