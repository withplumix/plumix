import { describe, expect, test } from "vitest";

import { MARK_SHORTCUTS } from "./shortcut-display.js";
import { MARK_LABELS } from "./shortcuts-dialog.js";

describe("MARK_LABELS", () => {
  test.each(MARK_SHORTCUTS.map(({ mark }) => mark))(
    "labels the %s mark, which declares a shortcut",
    (mark) => {
      expect(MARK_LABELS[mark]).toBeDefined();
    },
  );
});
