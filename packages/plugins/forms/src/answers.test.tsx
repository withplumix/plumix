import type { EntryContent } from "plumix/blocks";
import { createBlockRegistry } from "plumix/blocks";
import { BlockRenderer, PlumixProvider } from "plumix/blocks/renderer";
import { group, repeater, select, text, toggle } from "plumix/fields";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { FormDefinition } from "./define-form.js";
import {
  pickStoredAnswers,
  readSubmittedValues,
  visibleFields,
} from "./answers.js";
import { createFormBlock } from "./block/form-block.js";
import { defineForm } from "./define-form.js";
import { createFormRegistry } from "./registry.js";

const plan = select("plan").options(["basic", "pro"]);

/** One form, differing only in what `plan` starts as. */
function signupWith(planDefault: "basic" | "pro") {
  return defineForm("signup", {
    fields: [
      plan.default(planDefault),
      text("seats").visibleWhen(plan.is("pro")),
    ],
  });
}

/** The field keys the browser is served for a form. */
function renderedKeys(form: FormDefinition): readonly string[] {
  const formRegistry = createFormRegistry();
  formRegistry.register(form, "config");
  const block = createFormBlock(formRegistry);
  const content: EntryContent = {
    version: "plumix.v2",
    blocks: [{ id: "n", name: block.name, attrs: { slug: form.slug } }],
  };
  const html = renderToStaticMarkup(
    <PlumixProvider
      value={{ registry: createBlockRegistry([block]), mode: "live" }}
    >
      <BlockRenderer content={content} />
    </PlumixProvider>,
  );
  return [...html.matchAll(/data-plumix-form-field="([^"]+)"/g)].flatMap(
    (match) => match[1] ?? [],
  );
}

/** The field keys the handler leaves visible for a body. */
function keysOnSubmit(
  form: FormDefinition,
  body = new URLSearchParams(),
): readonly string[] {
  const values = readSubmittedValues(form.fields, body);
  return visibleFields(form.fields, values).map((field) => field.key);
}

describe("a condition", () => {
  test.each(["basic", "pro"] as const)(
    "decides the same fields on the server as in the browser (%s)",
    (planValue) => {
      const form = signupWith(planValue);

      expect(
        keysOnSubmit(form, new URLSearchParams([["plan", planValue]])),
      ).toEqual(renderedKeys(form));
    },
  );

  // The two sides answer the same question about different values, which
  // is the point: markup is built once from the form's defaults and
  // cached, while the handler judges the answers that actually came back.
  // A visitor who changes the driver is answering a form the server has
  // to read differently from the one it served.
  test("judges the submitted driver, not the one the markup was built from", () => {
    const servedAsBasic = signupWith("basic");

    expect(renderedKeys(servedAsBasic)).toEqual(["plan"]);
    expect(
      keysOnSubmit(servedAsBasic, new URLSearchParams([["plan", "pro"]])),
    ).toEqual(["plan", "seats"]);
  });
});

// Both sides build their bag by the same per-field rule, so the set the
// markup shows and the set the handler keeps can only differ where the
// visitor actually changed an answer. These two shapes are where that
// used to break: a driver the markup never rendered, whose default then
// vanished at submit, and a toggle, whose "off" a body cannot express on
// its own.
describe("a form nobody has touched", () => {
  test("reads a hidden driver as the default the markup judged it by", () => {
    const billing = select("plan").options(["free", "pro"]).default("free");
    const invoice = toggle("invoice")
      .default(true)
      .visibleWhen(billing.is("pro"));
    const form = defineForm("billing", {
      fields: [billing, invoice, text("vat").visibleWhen(invoice.isOn())],
    });

    // `invoice` is itself hidden, but its default is what makes `vat`
    // visible — and that has to hold on both sides.
    expect(renderedKeys(form)).toEqual(["plan", "vat"]);
    expect(keysOnSubmit(form)).toEqual(["plan", "vat"]);
  });

  test("reads an unticked box the same way the markup did", () => {
    const optIn = toggle("optIn");
    const form = defineForm("survey", {
      fields: [optIn, text("why").visibleWhen(optIn.isOff())],
    });

    expect(renderedKeys(form)).toEqual(["optIn", "why"]);
    expect(keysOnSubmit(form)).toEqual(["optIn", "why"]);
  });

  test("stores nothing for a field the visitor left blank", () => {
    const form = defineForm("survey", { fields: [text("why")] });
    const values = readSubmittedValues(form.fields, new URLSearchParams());

    expect(pickStoredAnswers(form.fields, values)).toEqual({});
  });
});

describe("visibleFields", () => {
  const { fields } = defineForm("choice", {
    fields: [plan, text("seats").visibleWhen(plan.is("pro"))],
  });

  test("keeps a field with no condition whatever the answers are", () => {
    expect(visibleFields(fields, {}).map((field) => field.key)).toEqual([
      "plan",
    ]);
  });

  test("keeps a conditional field once its driver satisfies the rule", () => {
    expect(
      visibleFields(fields, { plan: "pro" }).map((field) => field.key),
    ).toEqual(["plan", "seats"]);
  });
});

describe("a group", () => {
  const form = defineForm("profile", {
    fields: [
      text("name"),
      group("address").fields([text("city"), text("postcode")]),
    ],
  });

  test("posts its members under the group's own name", () => {
    const values = readSubmittedValues(
      form.fields,
      new URLSearchParams([
        ["name", "Ada"],
        ["address[city]", "London"],
      ]),
    );

    expect(values).toEqual({
      name: "Ada",
      address: { city: "London", postcode: undefined },
    });
  });

  test("stores its answers under its own key", () => {
    const values = readSubmittedValues(
      form.fields,
      new URLSearchParams([["address[postcode]", "SW1"]]),
    );

    expect(pickStoredAnswers(form.fields, values)).toEqual({
      address: { postcode: "SW1" },
    });
  });

  test("is absent when nobody answered anything inside it", () => {
    const values = readSubmittedValues(form.fields, new URLSearchParams());

    expect(pickStoredAnswers(form.fields, values)).toEqual({});
  });
});

describe("a repeater", () => {
  const vegetarian = toggle("vegetarian");
  const attendees = repeater("attendees").fields([
    text("who"),
    vegetarian,
    text("dietary").visibleWhen(vegetarian.isOn()),
  ]);
  const form = defineForm("party", { fields: [attendees] });

  /** What a browser posts for `rows` rendered rows of `attendees`. */
  function body(rows: readonly Record<string, string>[]): URLSearchParams {
    return new URLSearchParams(
      rows.flatMap((row, index) => [
        ["attendees[]", ""] as [string, string],
        ...Object.entries(row).map(([key, value]): [string, string] => [
          `attendees[${String(index)}][${key}]`,
          value,
        ]),
      ]),
    );
  }

  test("stores one row object per row the visitor filled in", () => {
    const values = readSubmittedValues(
      form.fields,
      body([{ who: "Ada" }, { who: "Grace" }]),
    );

    expect(pickStoredAnswers(form.fields, values)).toEqual({
      attendees: [
        { who: "Ada", vegetarian: false },
        { who: "Grace", vegetarian: false },
      ],
    });
  });

  test("drops a row nobody filled in, and the repeater once every row is blank", () => {
    const values = readSubmittedValues(
      form.fields,
      body([{ who: "Ada" }, {}, {}]),
    );

    expect(pickStoredAnswers(form.fields, values)).toEqual({
      attendees: [{ who: "Ada", vegetarian: false }],
    });
    expect(
      pickStoredAnswers(
        form.fields,
        readSubmittedValues(form.fields, body([{}])),
      ),
    ).toEqual({});
  });

  // The row is the scope: one row's answer decides that row's fields and
  // nothing about its neighbour's.
  test("judges a row-scoped condition against that row's own answers", () => {
    const values = readSubmittedValues(
      form.fields,
      body([
        { who: "Ada", vegetarian: "on", dietary: "no nuts" },
        { who: "Grace", dietary: "smuggled in" },
      ]),
    );

    expect(pickStoredAnswers(form.fields, values)).toEqual({
      attendees: [
        { who: "Ada", vegetarian: true, dietary: "no nuts" },
        { who: "Grace", vegetarian: false },
      ],
    });
  });

  test("reads no rows at all from a body carrying no markers", () => {
    const values = readSubmittedValues(form.fields, new URLSearchParams());

    expect(values).toEqual({ attendees: [] });
  });
});
