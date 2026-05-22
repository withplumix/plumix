import { describe, expect, test } from "vitest";

import { resolveEditorMode } from "./resolve-editor-mode.js";

const POST_TYPE_WITH_AUTOSAVE = {
  name: "post",
  supports: ["editor", "revisions", "autosave"],
};
const POST_TYPE_WITHOUT_AUTOSAVE = {
  name: "post",
  supports: ["editor", "revisions"],
};

const EDIT_OWN = new Set(["entry:post:edit_own"]);
const EDIT_ANY = new Set([
  "entry:post:edit_own",
  "entry:post:edit_any",
  "entry:post:publish",
]);

describe("resolveEditorMode", () => {
  test("status='draft' on an autosave-supporting type for a writer → edit-live", () => {
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "draft",
        isAuthor: true,
        capabilities: EDIT_OWN,
      }),
    ).toBe("edit-live");
  });

  test("status='published' on an autosave-supporting type for an editor → edit-with-draft", () => {
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "published",
        isAuthor: false,
        capabilities: EDIT_ANY,
      }),
    ).toBe("edit-with-draft");
  });

  test("status='published' on a type WITHOUT autosave supports → edit-live", () => {
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITHOUT_AUTOSAVE,
        currentStatus: "published",
        isAuthor: false,
        capabilities: EDIT_ANY,
      }),
    ).toBe("edit-live");
  });

  test("status='published' but author lacks edit_any AND isn't the author → edit-live (no preview affordance)", () => {
    // Plain readers shouldn't see the three-button header. Mode goes
    // back to edit-live so the existing read-only / no-edit UX wins.
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "published",
        isAuthor: false,
        capabilities: EDIT_OWN,
      }),
    ).toBe("edit-live");
  });

  test("status='published' with the entry's own author having edit_own → edit-with-draft", () => {
    // Authors editing their own published post get the draft flow too.
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "published",
        isAuthor: true,
        capabilities: EDIT_OWN,
      }),
    ).toBe("edit-with-draft");
  });

  test("missing entryType (manifest race / stale slug) → edit-live", () => {
    expect(
      resolveEditorMode({
        entryType: undefined,
        currentStatus: "published",
        isAuthor: true,
        capabilities: EDIT_ANY,
      }),
    ).toBe("edit-live");
  });

  test("status='scheduled' on an autosave-supporting type → edit-with-draft", () => {
    // Scheduled rows behave like published for the draft flow — the
    // post is already "live" in the sense that it's queued to go out,
    // so pending edits should land on autosave.
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "scheduled",
        isAuthor: false,
        capabilities: EDIT_ANY,
      }),
    ).toBe("edit-with-draft");
  });

  test("trashed entries return edit-live so the trash view doesn't surface a Publish button", () => {
    expect(
      resolveEditorMode({
        entryType: POST_TYPE_WITH_AUTOSAVE,
        currentStatus: "trash",
        isAuthor: true,
        capabilities: EDIT_ANY,
      }),
    ).toBe("edit-live");
  });
});
