import { email, select, text } from "plumix/fields";
import { describe, expect, test } from "vitest";

import { defineForm } from "./define-form.js";

describe("defineForm", () => {
  test("folds the field builders down to the wire projection", () => {
    const form = defineForm("contact", {
      fields: [text("name").label("Your name").required(), email("email")],
    });

    expect(form.slug).toBe("contact");
    expect(form.fields.map((field) => field.key)).toEqual(["name", "email"]);
    expect(form.fields[0]).toMatchObject({
      label: "Your name",
      inputType: "text",
      required: true,
    });
    expect(form.fields[1]?.inputType).toBe("email");
  });

  test("refuses a field type this release cannot render or store", () => {
    expect(() =>
      defineForm("application", {
        fields: [select("size").options(["s", "m"])],
      }),
    ).toThrow(/select/);
  });
});
