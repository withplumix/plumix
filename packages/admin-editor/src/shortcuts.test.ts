import { describe, expect, test } from "vitest";

import type { Chord, EditorShortcutId, KeyLike } from "./shortcuts.js";
import {
  EDITOR_SHORTCUTS,
  forwardedShortcut,
  forwardedShortcutId,
  isTypingTarget,
  matchesShortcut,
  SHORTCUT_GROUP_IDS,
  shortcutsInGroup,
} from "./shortcuts.js";

function key(over: Partial<KeyLike> = {}): KeyLike {
  return {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...over,
  };
}

/** The keypress a chord describes, or null when it describes a gesture. */
export function eventFor(chord: Chord): KeyLike | null {
  if (chord.key === undefined && chord.code === undefined) return null;
  return key({
    key: chord.key ?? "",
    code: chord.code ?? "",
    metaKey: chord.mod ?? false,
    shiftKey: chord.shift ?? false,
  });
}

describe("the roster", () => {
  test("every shortcut declares at least one chord", () => {
    for (const shortcut of EDITOR_SHORTCUTS) {
      expect(shortcut.chords.length).toBeGreaterThan(0);
    }
  });

  test("ids are unique", () => {
    const ids = EDITOR_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every group but formatting is declared in the roster", () => {
    for (const group of SHORTCUT_GROUP_IDS) {
      if (group === "formatting") continue;
      expect(shortcutsInGroup(group).length).toBeGreaterThan(0);
    }
  });

  test("every forwarded chord's wire token resolves back to its own binding", () => {
    for (const shortcut of EDITOR_SHORTCUTS) {
      if (!shortcut.forwarded) continue;
      for (const chord of shortcut.chords) {
        // `matchesChord` returns on `key` when there is one and never reads
        // `code`, so nothing else would catch a typo in the token the iframe
        // sends. The host can only ever resolve it back by code + shift.
        expect(chord.code).toBeTypeOf("string");
        expect(
          forwardedShortcutId(chord.code ?? "", chord.shift ?? false),
        ).toBe(shortcut.id);
      }
    }
  });

  // The bindings the roster describes but does not own — see EDITOR_SHORTCUTS.
  // Cmd+B is the vendored sidebar's and collides with the bold mark: only the
  // typing target tells them apart, which a chord can't express, so the roster
  // still reads it as a collision and the cheatsheet lists both spellings.
  const KNOWN_COLLISIONS: readonly EditorShortcutId[] = ["panels.toggle"];

  test("no two bindings answer the same keypress", () => {
    for (const shortcut of EDITOR_SHORTCUTS) {
      if (KNOWN_COLLISIONS.includes(shortcut.id)) continue;
      for (const chord of shortcut.chords) {
        const event = eventFor(chord);
        if (!event) continue;
        const firing = EDITOR_SHORTCUTS.filter(
          (other) =>
            !KNOWN_COLLISIONS.includes(other.id) &&
            matchesShortcut(other.id, event),
        ).map((other) => other.id);
        expect(firing).toEqual([shortcut.id]);
      }
    }
  });
});

describe("matchesShortcut", () => {
  test("undo and redo split on shift", () => {
    const z = { key: "z", metaKey: true };
    expect(matchesShortcut("history.undo", key(z))).toBe(true);
    expect(matchesShortcut("history.redo", key(z))).toBe(false);
    expect(matchesShortcut("history.redo", key({ ...z, shiftKey: true }))).toBe(
      true,
    );
    expect(matchesShortcut("history.undo", key({ ...z, shiftKey: true }))).toBe(
      false,
    );
  });

  test("ctrl stands in for cmd", () => {
    expect(
      matchesShortcut("history.undo", key({ key: "z", ctrlKey: true })),
    ).toBe(true);
    expect(matchesShortcut("history.undo", key({ key: "z" }))).toBe(false);
  });

  test("the help chords are ? and mod+slash", () => {
    expect(
      matchesShortcut("help.open", key({ key: "?", shiftKey: true })),
    ).toBe(true);
    expect(matchesShortcut("help.open", key({ key: "/", metaKey: true }))).toBe(
      true,
    );
    expect(matchesShortcut("help.open", key({ key: "/" }))).toBe(false);
  });

  test("the palette chord is mod+k", () => {
    expect(
      matchesShortcut("palette.open", key({ key: "k", metaKey: true })),
    ).toBe(true);
    expect(matchesShortcut("palette.open", key({ key: "k" }))).toBe(false);
  });

  test("a gesture-only chord never matches a key event", () => {
    expect(
      matchesShortcut("canvas.zoom", key({ key: "z", metaKey: true })),
    ).toBe(false);
    expect(
      matchesShortcut("selection.additive", key({ key: "a", shiftKey: true })),
    ).toBe(false);
  });

  test("clipboard ops match cmd/ctrl plus their letter", () => {
    expect(
      matchesShortcut("clipboard.copy", key({ key: "C", metaKey: true })),
    ).toBe(true);
    expect(
      matchesShortcut("clipboard.paste", key({ key: "v", ctrlKey: true })),
    ).toBe(true);
    expect(matchesShortcut("clipboard.cut", key({ key: "x" }))).toBe(false);
  });
});

describe("forwardedShortcutId", () => {
  test("Space is a canvas shortcut regardless of shift", () => {
    expect(forwardedShortcutId("Space", false)).toBe("canvas.pan");
    expect(forwardedShortcutId("Space", true)).toBe("canvas.pan");
  });

  test("Shift+0/1/2/X are the view shortcuts", () => {
    expect(forwardedShortcutId("Digit0", true)).toBe("canvas.actualSize");
    expect(forwardedShortcutId("Digit1", true)).toBe("canvas.fit");
    expect(forwardedShortcutId("Digit2", true)).toBe("canvas.frameSelection");
    expect(forwardedShortcutId("KeyX", true)).toBe("canvas.xray");
  });

  test("the same keys without shift are not shortcuts", () => {
    for (const code of ["Digit0", "Digit1", "Digit2", "KeyX"]) {
      expect(forwardedShortcutId(code, false)).toBeNull();
    }
  });

  test("unrelated keys are never shortcuts", () => {
    expect(forwardedShortcutId("KeyA", true)).toBeNull();
    expect(forwardedShortcutId("Digit3", true)).toBeNull();
    expect(forwardedShortcutId("Enter", false)).toBeNull();
  });

  test("the palette chord rides the bridge as KeyK", () => {
    expect(forwardedShortcutId("KeyK", false)).toBe("palette.open");
  });

  test("the help chords ride the bridge as Slash", () => {
    expect(forwardedShortcutId("Slash", true)).toBe("help.open");
    expect(forwardedShortcutId("Slash", false)).toBe("help.open");
  });
});

describe("forwardedShortcut", () => {
  test("resolves the wire code from the layout key, not the physical one", () => {
    // A layout where "?" doesn't sit on the Slash key: the chord still matches
    // by `key`, and the host hears the canonical code.
    expect(
      forwardedShortcut(key({ key: "?", code: "Minus", shiftKey: true })),
    ).toEqual({ id: "help.open", code: "Slash" });
  });

  test("passes physical canvas keys through", () => {
    expect(forwardedShortcut(key({ key: " ", code: "Space" }))).toEqual({
      id: "canvas.pan",
      code: "Space",
    });
    expect(
      forwardedShortcut(key({ key: "X", code: "KeyX", shiftKey: true })),
    ).toEqual({ id: "canvas.xray", code: "KeyX" });
  });

  test("ignores keys the host doesn't claim", () => {
    expect(
      forwardedShortcut(key({ key: "z", code: "KeyZ", metaKey: true })),
    ).toBeNull();
  });
});

describe("isTypingTarget", () => {
  test("form fields and editable content are typing targets", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom doesn't derive isContentEditable from the attribute.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  test("anything else is not", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
