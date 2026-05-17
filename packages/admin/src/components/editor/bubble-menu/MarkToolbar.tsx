import type { Editor } from "@tiptap/react";
import type { KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";

import type { MarkRegistry, ResolvedMarkSpec } from "@plumix/blocks";

interface MarkToolbarProps {
  readonly editor: Editor;
  readonly markRegistry: MarkRegistry;
}

const ARROW_DELTAS: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/**
 * Pure rendering layer for the mark bubble menu — one button per
 * registered mark, with `aria-pressed` reflecting the editor's active
 * state and onClick dispatching the standard Tiptap toggle chain.
 *
 * Kept separate from the Tiptap `BubbleMenu` positioning wrapper so
 * tests can render this directly against a stub editor without
 * involving floating-ui or selection state.
 */
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
      data-plumix-mark-toolbar=""
      role="toolbar"
      onKeyDown={handleKeyDown}
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
  const onClick = (): void => {
    editor.chain().focus().toggleMark(mark.name).run();
  };
  return (
    <button
      type="button"
      data-testid={`bubble-menu-${mark.name}`}
      aria-pressed={isActive}
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
