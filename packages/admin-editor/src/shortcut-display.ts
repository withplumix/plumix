import { coreMarks } from "@plumix/blocks";

import type { Chord, Gesture } from "./shortcuts.js";

// How a chord is *shown*, kept apart from `shortcuts.ts` so the key handlers —
// which run in the canvas iframe's bundle too — match a keypress without
// pulling the mark catalogue in behind them.

/** An inline-formatting binding, taken from the mark that declares it. */
export interface MarkShortcut {
  readonly mark: string;
  /** Fallback description; the dialog prefers a translated label. */
  readonly title: string;
  readonly chord: Chord;
}

// Tiptap spells its bindings "Mod-Shift-X". Parsing them keeps the marks as the
// one place a formatting shortcut is declared.
function parseTiptapShortcut(shortcut: string): Chord {
  const parts = shortcut.split("-");
  const key = parts[parts.length - 1] ?? "";
  return {
    mod: parts.includes("Mod"),
    ...(parts.includes("Shift") ? { shift: true } : {}),
    key: key.toLowerCase(),
  };
}

/** The inline marks that carry a keyboard shortcut, in bubble-menu order. */
export const MARK_SHORTCUTS: readonly MarkShortcut[] = coreMarks
  .filter((mark) => mark.keyboardShortcut !== undefined)
  .map((mark) => ({
    mark: mark.name,
    title: mark.title,
    chord: parseTiptapShortcut(mark.keyboardShortcut ?? ""),
  }));

/** A rendered piece of a chord: a key cap, or the pointer gesture completing it. */
export type ChordToken =
  | { readonly type: "key"; readonly label: string }
  | { readonly type: "gesture"; readonly gesture: Gesture };

// Physical codes the roster uses, spelled as the cap the author sees.
const CODE_CAPS: Readonly<Record<string, string>> = {
  Space: "Space",
  Slash: "/",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  KeyX: "X",
};

const KEY_CAPS: Readonly<Record<string, string>> = { Escape: "Esc" };

function keyCap(chord: Chord): string | null {
  if (chord.key !== undefined) {
    return (
      KEY_CAPS[chord.key] ??
      (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key)
    );
  }
  if (chord.code === undefined) return null;
  return CODE_CAPS[chord.code] ?? chord.code;
}

/** Render a chord as the tokens the cheatsheet shows, in press order. */
export function chordTokens(
  chord: Chord,
  apple: boolean,
): readonly ChordToken[] {
  const tokens: ChordToken[] = [];
  if (chord.mod) tokens.push({ type: "key", label: apple ? "⌘" : "Ctrl" });
  if (chord.shift) tokens.push({ type: "key", label: apple ? "⇧" : "Shift" });
  const cap = keyCap(chord);
  if (cap !== null) tokens.push({ type: "key", label: cap });
  if (chord.gesture) tokens.push({ type: "gesture", gesture: chord.gesture });
  return tokens;
}

/** Whether to print ⌘/⇧ rather than Ctrl/Shift. */
export function isApplePlatform(
  nav: { readonly platform?: string; readonly userAgent: string } = navigator,
): boolean {
  // `navigator.platform` is deprecated and some engines report it empty; the
  // user agent still names the OS when it does.
  const { platform = "", userAgent } = nav;
  return /Mac|iPhone|iPad|iPod/i.test(platform === "" ? userAgent : platform);
}
