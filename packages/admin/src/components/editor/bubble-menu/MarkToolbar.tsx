import type { Editor } from "@tiptap/react";
import type { ComponentType, KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";
import { Toggle } from "@/components/ui/toggle.js";
import { cn } from "@/lib/utils";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Keyboard,
  Link as LinkIcon,
  Quote,
  Strikethrough,
  Subscript,
  Superscript,
  TextQuote,
  Underline,
  WholeWord,
} from "lucide-react";

import type { MarkRegistry, ResolvedMarkSpec } from "@plumix/blocks";

interface MarkToolbarProps {
  readonly editor: Editor;
  readonly markRegistry: MarkRegistry;
}

const ARROW_DELTAS: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

// Hand-rolled, tree-shakeable mapping — bundling lucide via dynamic
// keys would pull every icon in (~1MB). Plugin marks fall back to the
// title text below when their `bubbleMenuIcon` isn't in this map.
const ICONS: Record<string, ComponentType<{ readonly className?: string }>> = {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link: LinkIcon,
  Underline,
  Subscript,
  Superscript,
  Highlighter,
  Keyboard,
  Quote,
  TextQuote,
  WholeWord,
};

export function MarkToolbar({
  editor,
  markRegistry,
}: MarkToolbarProps): ReactElement {
  // Skip marks the editor's schema doesn't load — clicking them would
  // be a no-op and we don't want dead buttons surfacing to the user.
  const schemaMarks = editor.schema.marks as Record<string, unknown>;
  const marks: ResolvedMarkSpec[] = Array.from(
    markRegistry,
    ([, spec]) => spec,
  ).filter((spec) => spec.name in schemaMarks);

  // Roving-focus arrow navigation: ArrowRight/Left moves focus within
  // the toolbar, wrapping at the ends. Tab/Shift-Tab still escape to
  // surrounding focusable elements — standard WAI-ARIA toolbar pattern.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = ARROW_DELTAS[event.key];
    if (delta === undefined) return;
    const root = rootRef.current;
    if (!root) return;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      "button[data-testid]",
    );
    if (buttons.length === 0) return;
    const active = root.ownerDocument.activeElement;
    const current = Array.from(buttons).indexOf(active as HTMLButtonElement);
    if (current === -1) return;
    event.preventDefault();
    const next = (current + delta + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Inline formatting"
      onKeyDown={handleKeyDown}
      className="bg-popover text-popover-foreground flex items-center gap-0.5 rounded-md border p-1 shadow-md"
    >
      {marks.map((mark) => (
        <MarkButton key={mark.name} mark={mark} editor={editor} />
      ))}
    </div>
  );
}

interface MarkButtonProps {
  readonly mark: ResolvedMarkSpec;
  readonly editor: Editor;
}

function MarkButton({ mark, editor }: MarkButtonProps): ReactElement {
  const label = mark.bubbleMenuLabel ?? mark.title;
  const isActive = editor.isActive(mark.name);
  const Icon = mark.bubbleMenuIcon ? ICONS[mark.bubbleMenuIcon] : undefined;
  return (
    <Toggle
      data-testid={`bubble-menu-${mark.name}`}
      size="sm"
      pressed={isActive}
      aria-label={label}
      title={label}
      onPressedChange={() => {
        editor.chain().focus().toggleMark(mark.name).run();
      }}
      className={cn(Icon ? "px-1.5" : "px-2 text-xs")}
    >
      {Icon ? <Icon className="size-4" /> : label}
    </Toggle>
  );
}
