import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import { resolveLabel } from "./label.js";
import { tx } from "./tx.js";

describe("tx", () => {
  test("object form returns a descriptor with the given context", () => {
    const tagged = tx({ message: "Post", context: "noun" });
    expect(tagged.message).toBe("Post");
    expect(tagged.context).toBe("noun");
  });

  test("object form preserves optional id and comment fields", () => {
    const tagged = tx({
      id: "post.singular",
      message: "Post",
      context: "noun",
      comment: "Singular post-type label.",
    });
    expect(tagged.id).toBe("post.singular");
    expect(tagged.comment).toBe("Singular post-type label.");
    expect(tagged.context).toBe("noun");
  });

  test("tagged-template form curries: tx`Post`('noun') → descriptor", () => {
    const tagged = tx`Post`("noun");
    expect(tagged.message).toBe("Post");
    expect(tagged.context).toBe("noun");
  });

  test("tagged-template form interpolates values into the message", () => {
    const verb = "Publish";
    const tagged = tx`${verb} this`("verb");
    expect(tagged.message).toBe("Publish this");
    expect(tagged.context).toBe("verb");
  });

  test("tagged-template form handles multiple interpolations", () => {
    const verb = "Publish";
    const noun = "post";
    const tagged = tx`${verb} this ${noun}`("verb");
    expect(tagged.message).toBe("Publish this post");
  });

  test("resolves through resolveLabel — context is translator metadata only", () => {
    const instance = setupI18n({
      locale: "de",
      messages: { de: { "post.singular.noun": "Beitrag" } },
    });
    const tagged = tx({
      id: "post.singular.noun",
      message: "Post",
      context: "noun",
    });
    expect(resolveLabel(tagged, instance)).toBe("Beitrag");
  });

  test("same message + different context yield distinct descriptors", () => {
    const noun = tx({ message: "Post", context: "noun" });
    const verb = tx({ message: "Post", context: "verb" });
    expect(noun.context).not.toBe(verb.context);
    expect(noun.message).toBe(verb.message);
  });
});
