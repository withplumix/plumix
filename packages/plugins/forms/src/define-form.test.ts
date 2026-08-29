import type { PlumixEnv } from "plumix";
import {
  color,
  date,
  email,
  group,
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
import { defineForm, toFormWire } from "./define-form.js";
import { FormsError } from "./errors.js";
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

const guarded = defineForm("guarded", {
  fields: [text("name")],
  turnstile: { siteKey: "0x4AAAsite", secret: "shhh" },
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
      defineForm("application", { fields: [color("brand")] }),
    ).toThrow(/color/);
  });

  test("refuses an unsupported type nested inside a repeater row", () => {
    expect(() =>
      defineForm("application", {
        fields: [repeater("referees").fields([color("brand")])],
      }),
    ).toThrow(/referees\[brand\]/);
  });

  test("refuses an unsupported type nested inside a group", () => {
    expect(() =>
      defineForm("application", {
        fields: [group("about").fields([color("brand")])],
      }),
    ).toThrow(/about\[brand\]/);
  });
});

describe("a form with rows and groups", () => {
  const application = defineForm("application", {
    fields: [
      group("address").fields([text("city").required(), text("postcode")]),
      repeater("referees")
        .fields([text("name").required(), email("email")])
        .min(1)
        .max(3),
    ],
  });

  test("keeps the row and member schemas on the wire projection", () => {
    const [address, referees] = application.fields;

    expect(address?.inputType).toBe("group");
    expect(address?.subFields?.map((field) => field.key)).toEqual([
      "city",
      "postcode",
    ]);
    expect(referees).toMatchObject({ inputType: "repeater", min: 1, max: 3 });
    expect(referees?.subFields?.map((field) => field.key)).toEqual([
      "name",
      "email",
    ]);
  });

  test("reflects the rows and the group in the inferred payload type", () => {
    expectTypeOf<FormAnswersOf<typeof application>>().toEqualTypeOf<{
      address: { city: string; postcode: string | undefined } | undefined;
      referees:
        readonly { name: string; email: string | undefined }[] | undefined;
    }>();
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

describe("a form that stores nothing", () => {
  test("is refused when nothing else would receive the submission", () => {
    expect(() =>
      defineForm("void", { fields: [text("name")], store: false }),
    ).toThrow(FormsError);
  });

  test("is accepted when its own handler takes them", () => {
    const form = defineForm("direct", {
      fields: [text("name")],
      store: false,
      onSubmit: () => undefined,
    });

    expect(form.store).toBe(false);
  });
});

describe("toFormWire", () => {
  // The island's props cross the wire as JSON. What is not on this shape
  // cannot leak to a browser, which is the point of projecting rather
  // than passing the definition straight through.
  test("carries what the markup renders from and nothing else", () => {
    const form = defineForm("direct", {
      title: "Get in touch",
      fields: [text("name")],
      store: false,
      validate: () => undefined,
      onSubmit: () => undefined,
    });

    expect(Object.keys(toFormWire(form)).sort()).toEqual([
      "fields",
      // Where the wizard is derived from: the browser pages through the
      // steps, so the breaks have to reach it.
      "pageBreaks",
      "slug",
      "submitLabel",
      "title",
      // The site key is public and the widget cannot render without it;
      // the secret beside it in the definition is what must not follow.
      "turnstile",
    ]);
  });

  test("hands the browser the site key and not the secret", () => {
    const wire = toFormWire(guarded);

    expect(wire.turnstile).toEqual({ siteKey: "0x4AAAsite" });
    expect(JSON.stringify(wire)).not.toContain("shhh");
  });

  test("carries no captcha for a form that declared none", () => {
    expect(toFormWire(enquiry).turnstile).toBeUndefined();
  });
});

describe("turnstile", () => {
  test("keeps the secret on the definition, where the server reads it", () => {
    expect(guarded.turnstile).toEqual({
      siteKey: "0x4AAAsite",
      secret: "shhh",
    });
  });

  test("takes a resolver for a secret that only exists at request time", () => {
    const resolver = (env: PlumixEnv) =>
      String((env as { SECRET?: string }).SECRET);
    const form = defineForm("resolved", {
      fields: [text("name")],
      turnstile: { siteKey: "0x4AAAsite", secret: resolver },
    });

    expect(form.turnstile?.secret).toBe(resolver);
  });
});
