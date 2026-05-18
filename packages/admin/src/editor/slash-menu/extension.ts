import type { Editor } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

import type { BlockRegistry } from "@plumix/blocks";

import type { SlashMenuItem } from "./items-from-registry.js";
import type { SlashMenuPanelHandle } from "./SlashMenuPanel.js";
import { itemsFromRegistry } from "./items-from-registry.js";
import { clampMenuPosition } from "./position.js";
import { SlashMenuPanel } from "./SlashMenuPanel.js";

interface CreateSlashMenuExtensionOptions {
  readonly blockRegistry: BlockRegistry;
  /**
   * Invoked when the user picks a block — receives the chosen spec and
   * the active editor. The default insertion command lives at the call
   * site so callers can decide how to insert (e.g., wrap selection vs.
   * replace empty paragraph).
   */
  readonly onPick: (item: SlashMenuItem, editor: Editor) => void;
}

interface PanelRendererHandle {
  readonly renderer: ReactRenderer<SlashMenuPanelHandle>;
  readonly mount: HTMLElement;
}

interface SuggestionRenderer {
  onStart(props: SuggestionProps<SlashMenuItem>): void;
  onUpdate(props: SuggestionProps<SlashMenuItem>): void;
  onKeyDown(props: SuggestionKeyDownProps): boolean;
  onExit(): void;
}

export function createSlashMenuExtension(
  options: CreateSlashMenuExtensionOptions,
): Extension {
  const items = itemsFromRegistry(options.blockRegistry);

  return Extension.create({
    name: "plumixSlashMenu",
    addProseMirrorPlugins() {
      const renderer = buildRenderer();
      // Without this, if the editor is destroyed mid-suggestion the
      // panel's <div> and React tree stay attached to document.body
      // forever — suggestion's onExit only fires on normal close.
      this.editor.on("destroy", () => renderer.onExit());

      const suggestionOptions: SuggestionOptions<SlashMenuItem> = {
        editor: this.editor,
        char: "/",
        startOfLine: false,
        // cmdk does the final filter+sort once mounted, so the
        // suggestion plugin just hands the full list through.
        items: () => items.slice(),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          options.onPick(props as SlashMenuItem, editor);
        },
        render: () => renderer,
      };
      return [Suggestion(suggestionOptions)];
    },
  });
}

function buildRenderer(): SuggestionRenderer {
  let handle: PanelRendererHandle | null = null;

  return {
    onStart(props: SuggestionProps<SlashMenuItem>) {
      const mount = document.createElement("div");
      mount.setAttribute("data-plumix-slash-menu-mount", "");
      mount.style.position = "absolute";
      mount.style.zIndex = "50";
      document.body.appendChild(mount);

      const renderer = new ReactRenderer<SlashMenuPanelHandle, PanelProps>(
        SlashMenuPanel,
        {
          editor: props.editor,
          props: buildPanelProps(props),
        },
      );
      mount.appendChild(renderer.element);
      positionMount(mount, props);
      handle = { renderer, mount };
    },
    onUpdate(props: SuggestionProps<SlashMenuItem>) {
      if (!handle) return;
      handle.renderer.updateProps(buildPanelProps(props));
      positionMount(handle.mount, props);
    },
    onKeyDown(props: SuggestionKeyDownProps): boolean {
      if (!handle) return false;
      const ref = handle.renderer.ref;
      return ref?.onKeyDown(props.event) ?? false;
    },
    onExit() {
      if (!handle) return;
      handle.renderer.destroy();
      handle.mount.remove();
      handle = null;
    },
  };
}

interface PanelProps {
  readonly items: readonly SlashMenuItem[];
  readonly query: string;
  readonly onSelect: (item: SlashMenuItem) => void;
  readonly onDismiss: () => void;
}

function buildPanelProps(props: SuggestionProps<SlashMenuItem>): PanelProps {
  return {
    items: props.items,
    query: props.query,
    onSelect: (item) => props.command(item),
    onDismiss: () => props.editor.commands.focus(),
  };
}

function positionMount(
  mount: HTMLElement,
  props: SuggestionProps<SlashMenuItem>,
): void {
  const rect = props.clientRect?.();
  if (!rect) return;
  // Mount wrapper measures 0×0 on the first onStart before layout;
  // fall back to the panel child so the clamp has a real width.
  const child = mount.firstElementChild as HTMLElement | null;
  const menuRect = (child ?? mount).getBoundingClientRect();
  const { top, left } = clampMenuPosition({
    caret: { top: rect.top, bottom: rect.bottom, left: rect.left },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    menu: { width: menuRect.width, height: menuRect.height },
  });
  mount.style.top = `${top}px`;
  mount.style.left = `${left}px`;
}
