/** A pointer gesture that completes a chord (the key half is the modifier). */
export type Gesture = "click" | "drag" | "scroll";

/**
 * An undefined modifier means "don't care"; pin it to `false` where the chord
 * with it belongs to another binding. Forwarded chords need both `key` and
 * `code`.
 */
export interface Chord {
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly key?: string;
  readonly code?: string;
  readonly gesture?: Gesture;
}

/** The slice of a keyboard event the matcher reads — React's synthetic event
 *  and the DOM's both satisfy it. */
export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

export const SHORTCUT_GROUP_IDS = [
  "general",
  "selection",
  "clipboard",
  "canvas",
  "formatting",
  "history",
] as const;

export type ShortcutGroupId = (typeof SHORTCUT_GROUP_IDS)[number];

interface ShortcutSpec {
  readonly id: string;
  readonly group: ShortcutGroupId;
  readonly chords: readonly Chord[];
  // Every chord of a forwarded shortcut must declare a `code` to travel as.
  readonly forwarded?: boolean;
}

// Pointer gestures are listed for the cheatsheet but matched elsewhere; inline
// formatting bindings belong to the marks.
const ROSTER = [
  {
    id: "help.open",
    group: "general",
    // Both spellings ride the bridge as "Slash": the iframe matches the layout
    // key and the host only ever sees the canonical code.
    chords: [
      { key: "?", code: "Slash", mod: false },
      { mod: true, key: "/", code: "Slash" },
    ],
    forwarded: true,
  },
  {
    id: "palette.open",
    group: "general",
    chords: [{ mod: true, shift: false, key: "k", code: "KeyK" }],
    forwarded: true,
  },
  // Shares the chord with the bold mark and stands aside while the author is
  // typing.
  {
    id: "panels.toggle",
    group: "general",
    chords: [{ mod: true, key: "b", code: "KeyB" }],
    forwarded: true,
  },
  {
    id: "selection.additive",
    group: "selection",
    chords: [
      { shift: true, gesture: "click" },
      { mod: true, gesture: "click" },
    ],
  },
  {
    id: "selection.delete",
    group: "selection",
    chords: [
      { key: "Delete", code: "Delete" },
      { key: "Backspace", code: "Backspace" },
    ],
    forwarded: true,
  },
  {
    id: "layers.rename",
    group: "selection",
    chords: [{ key: "F2" }],
  },
  {
    id: "clipboard.copy",
    group: "clipboard",
    chords: [{ mod: true, shift: false, key: "c" }],
  },
  {
    id: "clipboard.cut",
    group: "clipboard",
    chords: [{ mod: true, shift: false, key: "x" }],
  },
  {
    id: "clipboard.paste",
    group: "clipboard",
    chords: [{ mod: true, shift: false, key: "v" }],
  },
  {
    id: "canvas.pan",
    group: "canvas",
    chords: [{ mod: false, code: "Space", gesture: "drag" }],
    forwarded: true,
  },
  {
    id: "canvas.zoom",
    group: "canvas",
    chords: [{ mod: true, gesture: "scroll" }],
  },
  {
    id: "canvas.fit",
    group: "canvas",
    chords: [{ mod: false, shift: true, code: "Digit1" }],
    forwarded: true,
  },
  {
    id: "canvas.frameSelection",
    group: "canvas",
    chords: [{ mod: false, shift: true, code: "Digit2" }],
    forwarded: true,
  },
  {
    id: "canvas.actualSize",
    group: "canvas",
    chords: [{ mod: false, shift: true, code: "Digit0" }],
    forwarded: true,
  },
  {
    id: "canvas.xray",
    group: "canvas",
    chords: [{ mod: false, shift: true, code: "KeyX" }],
    forwarded: true,
  },
  {
    id: "canvas.cancelDrag",
    group: "canvas",
    chords: [{ key: "Escape" }],
  },
  {
    id: "history.undo",
    group: "history",
    chords: [{ mod: true, shift: false, key: "z", code: "KeyZ" }],
    forwarded: true,
  },
  {
    id: "history.redo",
    group: "history",
    chords: [{ mod: true, shift: true, key: "z", code: "KeyZ" }],
    forwarded: true,
  },
] as const satisfies readonly ShortcutSpec[];

export type EditorShortcutId = (typeof ROSTER)[number]["id"];

export interface EditorShortcut extends ShortcutSpec {
  readonly id: EditorShortcutId;
}

export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = ROSTER;

const BY_ID = new Map(EDITOR_SHORTCUTS.map((s) => [s.id, s]));

export function shortcutsInGroup(
  group: ShortcutGroupId,
): readonly EditorShortcut[] {
  return EDITOR_SHORTCUTS.filter((s) => s.group === group);
}

function matchesChord(chord: Chord, event: KeyLike): boolean {
  if (chord.mod !== undefined && chord.mod !== (event.metaKey || event.ctrlKey))
    return false;
  if (chord.shift !== undefined && chord.shift !== event.shiftKey) return false;
  if (chord.key !== undefined)
    return chord.key.toLowerCase() === event.key.toLowerCase();
  // A gesture-only chord (⌘+scroll, ⇧+click) has no key half, so no key event
  // can complete it.
  return chord.code !== undefined && chord.code === event.code;
}

/** Whether `event` fires the named binding. */
export function matchesShortcut(id: EditorShortcutId, event: KeyLike): boolean {
  return (BY_ID.get(id)?.chords ?? []).some((chord) =>
    matchesChord(chord, event),
  );
}

/** Matches on the layout key, so `?` works wherever a keyboard puts it. */
export function forwardedShortcut(
  event: KeyLike,
): { readonly id: EditorShortcutId; readonly code: string } | null {
  for (const shortcut of EDITOR_SHORTCUTS) {
    if (!shortcut.forwarded) continue;
    for (const chord of shortcut.chords) {
      if (chord.code !== undefined && matchesChord(chord, event)) {
        return { id: shortcut.id, code: chord.code };
      }
    }
  }
  return null;
}

/** The host end of the same seam: the bridge carries only code + shift. */
export function forwardedShortcutId(
  code: string,
  shiftKey: boolean,
): EditorShortcutId | null {
  for (const shortcut of EDITOR_SHORTCUTS) {
    if (!shortcut.forwarded) continue;
    for (const chord of shortcut.chords) {
      if (chord.code !== code) continue;
      if (chord.shift !== undefined && chord.shift !== shiftKey) continue;
      return shortcut.id;
    }
  }
  return null;
}

/**
 * `instanceof` holds only because the iframe loads its own copy of this module;
 * sharing one across realms would need a duck-typed check.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}
