import type { MessageDescriptor } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import { withContext } from "./context.js";
import { resolveLabel } from "./label.js";

describe("withContext", () => {
  test("last-write-wins when the source descriptor already carries a context", () => {
    const source: MessageDescriptor & { context: string } = {
      id: "post.singular",
      message: "Post",
      context: "old",
    };
    expect(withContext(source, "noun").context).toBe("noun");
  });

  test("preserves other descriptor fields like `comment` through the wrap", () => {
    const tagged = withContext(
      {
        id: "post.singular",
        message: "Post",
        comment: "Singular post-type label.",
      },
      "noun",
    );
    expect(tagged.comment).toBe("Singular post-type label.");
    expect(tagged.context).toBe("noun");
  });

  test("resolves through resolveLabel — context is translator metadata only", () => {
    const instance = setupI18n({
      locale: "de",
      messages: { de: { "post.singular": "Beitrag" } },
    });
    const tagged = withContext(
      { id: "post.singular", message: "Post" },
      "noun",
    );
    expect(resolveLabel(tagged, instance)).toBe("Beitrag");
  });

  test("empty-string context lands on the descriptor as-is", () => {
    // `format-po` drops falsy `msgctxt` from emitted catalogs (gettext
    // convention). The helper itself doesn't normalize; if a caller
    // ever needs to "unset" a context, this is how.
    expect(withContext({ id: "x", message: "X" }, "").context).toBe("");
  });
});
