import { select, text } from "plumix/fields";
import { describe, expect, test } from "vitest";

import type { SubmittedValues } from "./answers.js";
import type { FormDefinition } from "./define-form.js";
import { defaultAnswers } from "./answers.js";
import { defineForm } from "./define-form.js";
import { pageBreak, visibleSteps } from "./steps.js";

const plan = () => select("plan").options(["basic", "pro"]);

const survey = defineForm("survey", {
  fields: [
    pageBreak("About you"),
    text("name").label("Your name"),
    pageBreak("Your plan"),
    plan().label("Plan"),
    text("seats").label("Seats").visibleWhen(plan().is("pro")),
  ],
});

const steps = (
  form: FormDefinition,
  values: SubmittedValues = defaultAnswers(form.fields),
) =>
  visibleSteps(form, values).map((step) => ({
    title: step.title,
    keys: step.fields.map((field) => field.key),
  }));

describe("a page break in the field list", () => {
  test("leaves the field list flat", () => {
    expect(survey.fields.map((field) => field.key)).toEqual([
      "name",
      "plan",
      "seats",
    ]);
  });

  test("names the index of the field its step starts at", () => {
    expect(survey.pageBreaks).toEqual([
      { startIndex: 0, title: "About you" },
      { startIndex: 1, title: "Your plan" },
    ]);
  });
});

describe("the wizard derived from it", () => {
  test("splits the fields into one step per break", () => {
    expect(steps(survey)).toEqual([
      { title: "About you", keys: ["name"] },
      { title: "Your plan", keys: ["plan"] },
    ]);
  });

  test("is one untitled step for a form with no break", () => {
    const contact = defineForm("contact", { fields: [text("name")] });

    expect(steps(contact)).toEqual([{ title: undefined, keys: ["name"] }]);
  });

  test("admits a field a driver on an earlier step reveals", () => {
    expect(steps(survey, { plan: "pro" })).toEqual([
      { title: "About you", keys: ["name"] },
      { title: "Your plan", keys: ["plan", "seats"] },
    ]);
  });

  test("drops a step whose every field is hidden", () => {
    const gated = defineForm("gated", {
      fields: [
        plan(),
        pageBreak("Seats"),
        text("seats").visibleWhen(plan().is("pro")),
        pageBreak("Anything else"),
        text("notes"),
      ],
    });

    expect(steps(gated).map((step) => step.title)).toEqual([
      undefined,
      "Anything else",
    ]);
  });

  test("makes no step of a break that ends the field list", () => {
    const trailing = defineForm("trailing", {
      fields: [text("name"), pageBreak("Nothing follows")],
    });

    expect(steps(trailing)).toEqual([{ title: undefined, keys: ["name"] }]);
  });
});
