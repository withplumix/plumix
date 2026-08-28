import { text } from "plumix/fields";
import { describe, expect, test } from "vitest";

import { defineForm } from "./define-form.js";
import { createFormRegistry } from "./registry.js";

const contact = defineForm("contact", { fields: [text("name")] });

describe("createFormRegistry", () => {
  test("resolves a registered form by slug", () => {
    const registry = createFormRegistry();
    registry.register(contact, "config");

    expect(registry.get("contact")).toBe(contact);
  });

  test("returns undefined for a slug nobody registered", () => {
    expect(createFormRegistry().get("nope")).toBeUndefined();
  });

  test("rejects a second form on the same slug, naming both contributors", () => {
    const registry = createFormRegistry();
    registry.register(contact, "config");

    expect(() =>
      registry.register(
        defineForm("contact", { fields: [text("email")] }),
        "newsletter",
      ),
    ).toThrow(/"contact".*config.*newsletter/s);
  });
});
