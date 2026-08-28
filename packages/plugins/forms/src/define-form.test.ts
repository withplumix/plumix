import {
  date,
  email,
  number,
  repeater,
  select,
  text,
  textarea,
  toggle,
  url,
} from "plumix/fields";
import { describe, expect, expectTypeOf, test } from "vitest";

import type { FormAnswersOf } from "./define-form.js";
import { defineForm } from "./define-form.js";
import { tel } from "./fields.js";

const enquiry = defineForm("enquiry", {
  fields: [
    text("name").required(),
    email("email"),
    url("website"),
    tel("phone"),
    number("guests"),
    date("visitOn"),
    select("plan").options(["basic", "pro"]),
    toggle("newsletter"),
    textarea("message"),
  ],
});

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

  test("accepts every field type in the roster", () => {
    expect(enquiry.fields.map((field) => field.inputType)).toEqual([
      "text",
      "email",
      "url",
      "tel",
      "number",
      "date",
      "select",
      "toggle",
      "textarea",
    ]);
  });

  // A form is not registered, so the checks a `register*MetaBox` call runs
  // have nothing else to run them — and each of these fails silently at
  // submit rather than loudly here.
  test("refuses a field that would shadow the honeypot", () => {
    expect(() =>
      defineForm("contact", { fields: [text("__plumix_hp")] }),
    ).toThrow(/__plumix_/);
  });

  test("refuses two fields claiming one key", () => {
    expect(() =>
      defineForm("contact", { fields: [text("name"), email("name")] }),
    ).toThrow(/"name"/);
  });

  test("refuses a condition naming a field the form does not declare", () => {
    expect(() =>
      defineForm("contact", {
        fields: [
          text("name").visibleWhen(select("ghost").options(["x"]).is("x")),
        ],
      }),
    ).toThrow(/ghost/);
  });

  test("refuses a field type this release cannot render or store", () => {
    expect(() =>
      defineForm("application", {
        fields: [repeater("referees").fields([text("name")])],
      }),
    ).toThrow(/repeater/);
  });
});

describe("a form's answers type", () => {
  test("is one property per field, typed by what that field stores", () => {
    expectTypeOf<FormAnswersOf<typeof enquiry>>().toEqualTypeOf<{
      name: string;
      email: string | undefined;
      website: string | undefined;
      phone: string | undefined;
      guests: number | undefined;
      visitOn: string | undefined;
      plan: "basic" | "pro" | undefined;
      newsletter: boolean | undefined;
      message: string | undefined;
    }>();
  });
});
