import type { ReactElement, ReactNode } from "react";
import { useEffect } from "react";
import { Trans } from "@lingui/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";
import { Kbd } from "@plumix/admin-ui/kbd";

import type {
  Chord,
  EditorShortcutId,
  Gesture,
  ShortcutGroupId,
} from "./shortcuts.js";
import { useEditorStore } from "./provider.js";
import {
  chordTokens,
  isApplePlatform,
  MARK_SHORTCUTS,
} from "./shortcut-display.js";
import {
  isTypingTarget,
  matchesShortcut,
  SHORTCUT_GROUP_IDS,
  shortcutsInGroup,
} from "./shortcuts.js";

// One label per declared binding. The Record's key type is the id union, so a
// binding added to the roster is a compile error here until it's described —
// the omission the issue asks for, caught before it can ship.
const SHORTCUT_LABELS: Record<EditorShortcutId, ReactNode> = {
  "help.open": (
    <Trans id="editor.shortcut.help.open" message="Show keyboard shortcuts" />
  ),
  "panels.toggle": (
    <Trans
      id="editor.shortcut.panels.toggle"
      message="Show or hide the panels"
    />
  ),
  "selection.additive": (
    <Trans
      id="editor.shortcut.selection.additive"
      message="Add a block to the selection"
    />
  ),
  "selection.delete": (
    <Trans
      id="editor.shortcut.selection.delete"
      message="Delete the focused layer"
    />
  ),
  "clipboard.copy": (
    <Trans id="editor.shortcut.clipboard.copy" message="Copy the selection" />
  ),
  "clipboard.cut": (
    <Trans id="editor.shortcut.clipboard.cut" message="Cut the selection" />
  ),
  "clipboard.paste": (
    <Trans id="editor.shortcut.clipboard.paste" message="Paste blocks" />
  ),
  "canvas.pan": (
    <Trans id="editor.shortcut.canvas.pan" message="Pan the canvas" />
  ),
  "canvas.zoom": (
    <Trans id="editor.shortcut.canvas.zoom" message="Zoom the canvas" />
  ),
  "canvas.fit": (
    <Trans id="editor.shortcut.canvas.fit" message="Fit to width" />
  ),
  "canvas.frameSelection": (
    <Trans
      id="editor.shortcut.canvas.frameSelection"
      message="Zoom to the selection"
    />
  ),
  "canvas.actualSize": (
    <Trans id="editor.shortcut.canvas.actualSize" message="Zoom to 100%" />
  ),
  "canvas.xray": (
    <Trans
      id="editor.shortcut.canvas.xray"
      message="X-ray: outline all blocks"
    />
  ),
  "canvas.cancelDrag": (
    <Trans id="editor.shortcut.canvas.cancelDrag" message="Cancel a drag" />
  ),
  "history.undo": <Trans id="editor.shortcut.history.undo" message="Undo" />,
  "history.redo": <Trans id="editor.shortcut.history.redo" message="Redo" />,
};

/** Descriptions for the marks that declare a shortcut. A mark without one falls
 *  back to its untranslated spec title, so a new mark shows up rather than
 *  vanishing from the list. */
export const MARK_LABELS: Readonly<Record<string, ReactNode>> = {
  bold: <Trans id="editor.shortcut.mark.bold" message="Bold" />,
  italic: <Trans id="editor.shortcut.mark.italic" message="Italic" />,
  strike: <Trans id="editor.shortcut.mark.strike" message="Strikethrough" />,
  code: <Trans id="editor.shortcut.mark.code" message="Inline code" />,
  underline: <Trans id="editor.shortcut.mark.underline" message="Underline" />,
};

const GROUP_LABELS: Record<ShortcutGroupId, ReactNode> = {
  general: <Trans id="editor.shortcuts.group.general" message="General" />,
  selection: (
    <Trans id="editor.shortcuts.group.selection" message="Selection" />
  ),
  clipboard: (
    <Trans id="editor.shortcuts.group.clipboard" message="Clipboard" />
  ),
  canvas: <Trans id="editor.shortcuts.group.canvas" message="Canvas" />,
  formatting: (
    <Trans id="editor.shortcuts.group.formatting" message="Formatting" />
  ),
  history: <Trans id="editor.shortcuts.group.history" message="History" />,
};

// The pointer half of a chord — ⇧-click, space-drag, ⌘-scroll.
const GESTURE_LABELS: Record<Gesture, ReactNode> = {
  click: <Trans id="editor.shortcuts.gesture.click" message="Click" />,
  drag: <Trans id="editor.shortcuts.gesture.drag" message="Drag" />,
  scroll: <Trans id="editor.shortcuts.gesture.scroll" message="Scroll" />,
};

/**
 * The keyboard cheatsheet, opened with `?` / Cmd+/ or the toolbar's help
 * button. Every row is read off the shortcut roster the handlers match
 * against, so the list is what the editor actually does.
 */
export function ShortcutsDialog(): ReactElement {
  const open = useEditorStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useEditorStore((s) => s.setShortcutsOpen);
  const apple = isApplePlatform();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (!matchesShortcut("help.open", event)) return;
      event.preventDefault();
      setShortcutsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShortcutsOpen]);

  return (
    <Dialog open={open} onOpenChange={setShortcutsOpen}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="plumix-shortcuts-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="plumix-shortcuts-title">
            <Trans id="editor.shortcuts.title" message="Keyboard shortcuts" />
          </DialogTitle>
          <DialogDescription>
            <Trans
              id="editor.shortcuts.description"
              message="Every binding the editor claims."
            />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUT_GROUP_IDS.map((group) => (
            <section key={group} data-testid={`plumix-shortcut-group-${group}`}>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {GROUP_LABELS[group]}
              </h3>
              <dl className="grid gap-1">
                {group === "formatting"
                  ? MARK_SHORTCUTS.map(({ mark, title, chord }) => (
                      <Row
                        key={mark}
                        testId={`plumix-shortcut-mark-${mark}`}
                        label={MARK_LABELS[mark] ?? title}
                        chords={[chord]}
                        apple={apple}
                      />
                    ))
                  : shortcutsInGroup(group).map((shortcut) => (
                      <Row
                        key={shortcut.id}
                        testId={`plumix-shortcut-${shortcut.id}`}
                        label={SHORTCUT_LABELS[shortcut.id]}
                        chords={shortcut.chords}
                        apple={apple}
                      />
                    ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  testId,
  label,
  chords,
  apple,
}: {
  readonly testId: string;
  readonly label: ReactNode;
  readonly chords: readonly Chord[];
  readonly apple: boolean;
}): ReactElement {
  return (
    <div
      className="flex items-baseline justify-between gap-4 text-sm"
      data-testid={testId}
    >
      <dt className="min-w-0">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1">
        {chords.map((chord, index) => (
          // Chords are a fixed, order-stable declaration — the index is the key.
          <span key={index} className="flex items-center gap-1">
            {index > 0 ? (
              <span className="text-muted-foreground text-xs">
                <Trans id="editor.shortcuts.or" message="or" />
              </span>
            ) : null}
            {chordTokens(chord, apple).map((token, tokenIndex) =>
              token.type === "key" ? (
                <Kbd key={tokenIndex}>{token.label}</Kbd>
              ) : (
                <span
                  key={tokenIndex}
                  className="text-muted-foreground text-xs"
                >
                  {GESTURE_LABELS[token.gesture]}
                </span>
              ),
            )}
          </span>
        ))}
      </dd>
    </div>
  );
}
