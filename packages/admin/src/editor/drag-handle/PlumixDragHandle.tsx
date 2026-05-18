import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.js";
import { useIsMobile } from "@/hooks/use-mobile.js";
import { DragHandle } from "@tiptap/extension-drag-handle-react";

import type { BlockRegistry, BlockTransformTo } from "@plumix/blocks";

import type { BlockMenuOpenDetail } from "./block-menu-keyboard.js";
import { BlockMenu } from "../block-menu/BlockMenu.js";
import { useMobileInspectorSheet } from "../inspector/mobile-inspector-sheet.js";
import { BLOCK_MENU_OPEN_EVENT } from "./block-menu-keyboard.js";
import { DragHandleButton } from "./DragHandleButton.js";
import { MobileInspectorTrigger } from "./MobileInspectorTrigger.js";
import { nextTrackedNode } from "./next-tracked.js";

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
  const isMobile = useIsMobile();
  const mobileSheet = useMobileInspectorSheet();

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

  // `openRef` is the source of truth for the `onNodeChange` guard;
  // setters that open the popover flip it imperatively *before*
  // scheduling React state so a synchronous `onNodeChange(null)`
  // following `setOpen(true)` can't clobber `tracked` between the
  // state update and React's next commit. Closing happens through
  // Radix → setOpen, which the effect mirrors back into the ref.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const openPopover = useCallback((): void => {
    openRef.current = true;
    setOpen(true);
  }, []);

  // Detect coarse pointers (touch). Read inside the callback via a
  // ref so the stable `useCallback([])` identity survives.
  const isTouchRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(pointer: coarse)");
    const sync = (): void => {
      isTouchRef.current = mql.matches;
    };
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  // Pinned identity: `DragHandle` lists `onNodeChange` in its effect
  // deps, so a fresh callback per render re-registers the ProseMirror
  // plugin and tears down the slash-menu mount mid-typing (#342).
  // While the popover is open we freeze the anchor (matches
  // Notion/Linear behavior). Otherwise we route through
  // `nextTrackedNode`, which on touch suppresses the plugin's
  // hover-driven `onNodeChange(null)` so the handle stays anchored
  // to the last-tapped block.
  const onNodeChange = useCallback(({ node, pos }: OnNodeChangeArgs) => {
    if (openRef.current) return;
    setTracked((current) =>
      nextTrackedNode({
        isTouch: isTouchRef.current,
        current,
        incoming: { node, pos },
      }),
    );
  }, []);

  // Keyboard-only path: the drag-handle plugin is mouse-driven, so
  // pressing the keyboard shortcut dispatches a CustomEvent on the
  // editor's `view.dom`. Scoping to `view.dom` (not `document`)
  // prevents crosstalk if a second editor mounts on the same page —
  // each PlumixDragHandle resolves `pos` against its own editor's doc.
  useEffect(() => {
    let dom: HTMLElement | null = null;
    const handler = (event: Event): void => {
      const { pos } = (event as CustomEvent<BlockMenuOpenDetail>).detail;
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;
      setTracked({ node, pos });
      openPopover();
    };
    const attach = ({ editor: ed }: { editor: typeof editor }): void => {
      if (dom) return;
      dom = ed.view.dom;
      dom.addEventListener(BLOCK_MENU_OPEN_EVENT, handler);
    };
    editor.on("create", attach);
    // Editor may already be mounted when this effect runs (StrictMode
    // remount, or this effect's first run after the create event has
    // already fired). The view-access guard in Tiptap throws synchronously
    // pre-mount, so catch and let `create` handle the attach later.
    try {
      attach({ editor });
    } catch {
      /* view not ready; the `create` handler covers it */
    }
    return () => {
      editor.off("create", attach);
      dom?.removeEventListener(BLOCK_MENU_OPEN_EVENT, handler);
    };
  }, [editor]);

  return (
    <DragHandle editor={editor} onNodeChange={onNodeChange}>
      <div className="flex items-center gap-0.5">
        {isMobile ? (
          <MobileInspectorTrigger
            open={mobileSheet.open}
            onOpen={() => mobileSheet.setOpen(true)}
          />
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <DragHandleButton onOpenMenu={openPopover} />
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="start"
            className="w-56 p-0"
            onOpenAutoFocus={(event) => {
              // Radix defaults to focusing the first tab-stop in the
              // content; BlockMenu has none (cmdk items aren't tabbable).
              // Route focus onto the hidden cmdk input so it receives
              // ArrowDown / Enter for keyboard-only authors. The explicit
              // `data-plumix-block-menu-input` selector survives future
              // additions of unrelated <input> elements to the popover.
              event.preventDefault();
              const content = event.currentTarget as HTMLElement | null;
              const input = content?.querySelector<HTMLElement>(
                "[data-plumix-block-menu-input]",
              );
              input?.focus();
            }}
          >
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
      </div>
    </DragHandle>
  );
}
