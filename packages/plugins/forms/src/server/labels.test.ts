import {
  compileMetaBoxFields,
  select,
  text,
  toMetaBoxFieldEntry,
} from "plumix/fields";
import { describe, expect, test } from "vitest";

import { buildLabelSnapshot } from "./labels.js";

const project = (fields: Parameters<typeof compileMetaBoxFields>[0]) =>
  compileMetaBoxFields(fields).map(toMetaBoxFieldEntry);

describe("buildLabelSnapshot", () => {
  test("records what each field was called", () => {
    const snapshot = buildLabelSnapshot(
      project([text("name").label("Your name"), text("message")]),
    );

    expect(snapshot).toEqual({
      name: { label: "Your name" },
      // No label authored — the builder's humanized key stands in.
      message: { label: "Message" },
    });
  });

  test("records option labels beside the field's own", () => {
    const snapshot = buildLabelSnapshot(
      project([
        select("applicantType")
          .options([
            { value: "business", label: "Business" },
            { value: "individual", label: "Individual" },
          ])
          .label("Applying as"),
      ]),
    );

    expect(snapshot).toEqual({
      applicantType: {
        label: "Applying as",
        options: { business: "Business", individual: "Individual" },
      },
    });
  });

  test("resolves a translatable descriptor to its source message", () => {
    const snapshot = buildLabelSnapshot(
      project([
        text("email").label({ id: "form.contact.email", message: "Email" }),
      ]),
    );

    expect(snapshot.email?.label).toBe("Email");
  });
});
