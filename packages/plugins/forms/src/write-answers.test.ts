import {
  email,
  group,
  number,
  repeater,
  select,
  text,
  toggle,
} from "plumix/fields";
import { describe, expect, test } from "vitest";

import type { SubmittedValues } from "./answers.js";
import type { FormDefinition } from "./define-form.js";
import {
  pickStoredAnswers,
  readSubmittedValues,
  writeSubmittedValues,
} from "./answers.js";
import { defineForm } from "./define-form.js";

/**
 * What the endpoint would store for answers written to a body — the whole
 * point of the encoder is that this is the same row a filled-in form
 * produces, so every case below asserts the round trip rather than the
 * body's exact spelling.
 */
function stored(form: FormDefinition, answers: SubmittedValues) {
  const body = writeSubmittedValues(form.fields, answers);
  return pickStoredAnswers(form.fields, readSubmittedValues(form.fields, body));
}

describe("writeSubmittedValues", () => {
  test("round-trips a form's scalar answers", () => {
    const form = defineForm("contact", {
      fields: [text("name"), email("email"), number("guests")],
    });

    expect(
      stored(form, { name: "Ada", email: "ada@x.test", guests: 4 }),
    ).toEqual({ name: "Ada", email: "ada@x.test", guests: 4 });
  });

  test("leaves a field the caller omitted to its declared default", () => {
    const form = defineForm("contact", {
      fields: [text("name"), text("source").default("web")],
    });

    expect(stored(form, { name: "Ada" })).toEqual({
      name: "Ada",
      source: "web",
    });
  });

  test("carries a toggle switched off against a default that is on", () => {
    const form = defineForm("signup", {
      fields: [toggle("newsletter").default(true)],
    });

    expect(stored(form, { newsletter: false })).toEqual({ newsletter: false });
    expect(stored(form, { newsletter: true })).toEqual({ newsletter: true });
  });

  test("carries a multiple choice the caller emptied", () => {
    const form = defineForm("signup", {
      fields: [select("topics").options(["news", "events"]).multiple()],
    });

    expect(stored(form, { topics: [] })).toEqual({ topics: [] });
    expect(stored(form, { topics: ["news", "events"] })).toEqual({
      topics: ["news", "events"],
    });
  });

  test("round-trips a group's members", () => {
    const form = defineForm("contact", {
      fields: [group("company").fields([text("name"), text("vatNumber")])],
    });

    expect(
      stored(form, { company: { name: "Acme", vatNumber: "GB1" } }),
    ).toEqual({ company: { name: "Acme", vatNumber: "GB1" } });
  });

  test("round-trips a repeater's rows, one marker per row", () => {
    const form = defineForm("rsvp", {
      fields: [repeater("attendees").fields([text("who"), toggle("vegan")])],
    });

    expect(
      stored(form, {
        attendees: [
          { who: "Ada", vegan: true },
          { who: "Grace", vegan: false },
        ],
      }),
    ).toEqual({
      attendees: [
        { who: "Ada", vegan: true },
        { who: "Grace", vegan: false },
      ],
    });
  });

  test("posts no rows for a repeater the caller left out", () => {
    const form = defineForm("rsvp", {
      fields: [text("name"), repeater("attendees").fields([text("who")])],
    });

    expect(stored(form, { name: "Ada" })).toEqual({ name: "Ada" });
  });

  test("drops an answer naming no field the form declared", () => {
    const form = defineForm("contact", { fields: [text("name")] });

    const body = writeSubmittedValues(form.fields, {
      name: "Ada",
      role: "admin",
    });

    expect(body.has("role")).toBe(false);
  });

  test("names a nested field as it posts", () => {
    const form = defineForm("rsvp", {
      fields: [repeater("attendees").fields([text("who")])],
    });

    const body = writeSubmittedValues(form.fields, {
      attendees: [{ who: "Ada" }],
    });

    expect(body.get("attendees[0][who]")).toBe("Ada");
    expect(body.getAll("attendees[]")).toEqual([""]);
  });

  // A caller manages their own rows, and `delete rows[i]` or `rows[n] = x`
  // leaves holes. Numbering by where a row sits in the caller's array
  // rather than by where it is written puts an answer under a name the
  // read side, which counts markers from zero, never looks for.
  test("numbers rows by where they are written, not where the caller held them", () => {
    const form = defineForm("rsvp", {
      fields: [repeater("attendees").fields([text("who").required()])],
    });
    const sparse: SubmittedValues[] = [];
    sparse[2] = { who: "Ada" };

    expect(stored(form, { attendees: sparse })).toEqual({
      attendees: [{ who: "Ada" }],
    });
  });
});
