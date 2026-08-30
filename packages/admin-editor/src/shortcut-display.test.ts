import { describe, expect, test } from "vitest";

import type { Chord } from "./shortcuts.js";
import {
  chordTokens,
  isApplePlatform,
  MARK_SHORTCUTS,
} from "./shortcut-display.js";
import { EDITOR_SHORTCUTS, matchesShortcut } from "./shortcuts.js";
import { eventFor } from "./shortcuts.test.js";

describe("MARK_SHORTCUTS", () => {
  test("come from the core marks that declare a shortcut", () => {
    expect(MARK_SHORTCUTS.map((m) => m.mark)).toEqual([
      "bold",
      "italic",
      "strike",
      "code",
      "underline",
    ]);
    expect(MARK_SHORTCUTS[0]?.chord).toEqual({ mod: true, key: "b" });
    // "Mod-Shift-X" — the modifier tokens are parsed, not hand-copied.
    expect(MARK_SHORTCUTS[2]?.chord).toEqual({
      mod: true,
      shift: true,
      key: "x",
    });
  });

  // The vocabulary `parseTiptapShortcut` understands. A mark declaring "Alt-x"
  // would parse to a chord that silently prints and matches without the Alt.
  test("declare their bindings in modifiers a chord can carry", () => {
    for (const { chord } of MARK_SHORTCUTS) {
      expect(chord.key).not.toBe("");
      expect(Object.keys(chord).sort()).not.toContain("gesture");
    }
  });

  // What would have caught Cmd+Shift+X (strikethrough) also toggling x-ray:
  // both are listed in the same dialog, three rows apart.
  test("no formatting binding is also an editor binding", () => {
    for (const { mark, chord } of MARK_SHORTCUTS) {
      const event = eventFor(chord);
      if (!event) continue;
      const firing = EDITOR_SHORTCUTS.filter((s) =>
        matchesShortcut(s.id, event),
      ).map((s) => s.id);
      // Cmd+B is the vendored sidebar's rails toggle; see EDITOR_SHORTCUTS.
      expect(firing).toEqual(mark === "bold" ? ["panels.toggle"] : []);
    }
  });
});

describe("chordTokens", () => {
  const apple = (chord: Chord): readonly string[] =>
    chordTokens(chord, true).map((t) =>
      t.type === "key" ? t.label : t.gesture,
    );
  const other = (chord: Chord): readonly string[] =>
    chordTokens(chord, false).map((t) =>
      t.type === "key" ? t.label : t.gesture,
    );

  test("modifier glyphs follow the platform", () => {
    expect(apple({ mod: true, shift: true, key: "z" })).toEqual([
      "⌘",
      "⇧",
      "Z",
    ]);
    expect(other({ mod: true, shift: true, key: "z" })).toEqual([
      "Ctrl",
      "Shift",
      "Z",
    ]);
  });

  test("an explicitly absent modifier prints nothing", () => {
    expect(apple({ mod: true, shift: false, key: "z" })).toEqual(["⌘", "Z"]);
  });

  test("physical codes print as their key cap", () => {
    expect(apple({ code: "Space" })).toEqual(["Space"]);
    expect(apple({ shift: true, code: "Digit1" })).toEqual(["⇧", "1"]);
    expect(apple({ shift: true, code: "KeyX" })).toEqual(["⇧", "X"]);
    expect(apple({ code: "Slash" })).toEqual(["/"]);
  });

  test("Escape prints as Esc", () => {
    expect(apple({ key: "Escape" })).toEqual(["Esc"]);
  });

  test("gestures are their own token", () => {
    expect(apple({ code: "Space", gesture: "drag" })).toEqual([
      "Space",
      "drag",
    ]);
    expect(apple({ mod: true, gesture: "scroll" })).toEqual(["⌘", "scroll"]);
  });
});

describe("isApplePlatform", () => {
  test("reads the platform, falling back to the user agent", () => {
    expect(isApplePlatform({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(isApplePlatform({ platform: "iPhone", userAgent: "" })).toBe(true);
    expect(isApplePlatform({ platform: "Win32", userAgent: "" })).toBe(false);
    expect(
      isApplePlatform({ userAgent: "… Macintosh; Intel Mac OS X …" }),
    ).toBe(true);
    expect(isApplePlatform({ userAgent: "… X11; Linux x86_64 …" })).toBe(false);
  });
});
