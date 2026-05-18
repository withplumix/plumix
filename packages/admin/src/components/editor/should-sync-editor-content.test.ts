import type { JSONContent } from "@tiptap/react";
import { describe, expect, test } from "vitest";

import { shouldSyncEditorContent } from "./should-sync-editor-content.js";

const docWithSlash: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "/" }],
    },
  ],
};

describe("shouldSyncEditorContent", () => {
  test("returns false when current and incoming are structurally equal (fresh ref, same shape)", () => {
    // RHF re-emits the same content as a fresh object reference on
    // every keystroke — the structural compare must catch this.
    const incoming = structuredClone(docWithSlash);
    expect(shouldSyncEditorContent(docWithSlash, incoming, false)).toBe(false);
  });

  test("returns false when the editor is focused, even on a content change", () => {
    const incoming: JSONContent = {
      ...docWithSlash,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "/h" }],
        },
      ],
    };
    expect(shouldSyncEditorContent(docWithSlash, incoming, true)).toBe(false);
  });

  test("returns true when content differs and the editor is not focused", () => {
    const incoming: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    };
    expect(shouldSyncEditorContent(docWithSlash, incoming, false)).toBe(true);
  });
});
