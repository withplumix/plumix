/** A pointer gesture that completes a chord (the key half is the modifier). */
export type Gesture = "click" | "drag" | "scroll";

/**
 * One key combination. `mod` is ⌘ on Apple platforms and Ctrl elsewhere;
 * leaving a modifier undefined means "don't care" — the binding fires with or
 * without it, and the cheatsheet prints the chord without it. Pin the modifier
 * to `false` wherever that under-description would matter, i.e. wherever the
 * chord-with-modifier belongs to some other binding.
 *
 * A chord identifies its key either by `key` (the layout-dependent value, so
 * `?` is `?` on every keyboard) or by `code` (the physical key, for the
 * positional bindings like Space and Shift+1). Forwarded chords carry both:
 * the iframe matches on `key`, then sends `code` as the wire token.
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
  /** Alternatives — any one of them fires the binding. */
  readonly chords: readonly Chord[];
  /** Claimed by the canvas iframe and forwarded to the host over the bridge.
   *  Every chord of a forwarded shortcut must declare a `code` to travel as. */
  readonly forwarded?: boolean;
}

/**
 * Every keyboard binding the editor claims, declared once, so the cheatsheet
 * can't drift from what the editor actually does. Every key handler matches
 * against this roster rather than spelling its own key test.
 *
 * Three entries are described here but matched elsewhere, because no seam
 * reaches them: the two pointer gestures (`matchesShortcut` takes a key event,
 * so a gesture chord can never fire one) and `panels.toggle`, which belongs to
 * the vendored sidebar.
 *
 * Inline formatting is the exception — those bindings belong to the marks, so
 * `shortcut-display.ts` derives them from the mark catalogue instead.
 */
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
  // The only binding this roster describes without owning: Cmd+B is the
  // vendored shadcn sidebar's own listener, which we don't edit.
  { id: "panels.toggle", group: "general", chords: [{ mod: true, key: "b" }] },
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
    chords: [{ key: "Delete" }, { key: "Backspace" }],
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
    chords: [{ mod: true, shift: false, key: "z" }],
  },
  {
    id: "history.redo",
    group: "history",
    chords: [{ mod: true, shift: true, key: "z" }],
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

/**
 * Resolve a key event the canvas iframe saw into the binding it fires and the
 * code it travels to the host as. The iframe matches on the layout key, so a
 * keyboard that puts `?` somewhere other than the Slash cap still works.
 */
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
 * Whether the author is typing into `target`, so a shortcut must stand aside.
 * The `instanceof` holds because the canvas iframe loads its own copy of this
 * module (own realm, own `HTMLElement`) — a bundling change that made host and
 * iframe share one instance would need a duck-typed check instead.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}
