import { describe, expect, test } from "vitest";

import { EDITOR_COMMAND_DESCRIPTORS } from "@plumix/admin-editor";

import { EDITOR_COMMAND_MIRROR } from "./editor-command-i18n.js";

// Drift in either direction silently un-translates a palette command title.
describe("editor command catalog mirror", () => {
  test("carries exactly the ids and source messages the palette renders", () => {
    const source = new Map(
      Object.values(EDITOR_COMMAND_DESCRIPTORS).map((d) => [d.id, d.message]),
    );
    const mirror = new Map(
      Object.values(EDITOR_COMMAND_MIRROR).map((d) => [d.id, d.message]),
    );
    expect(mirror).toStrictEqual(source);
  });
});
