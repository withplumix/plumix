import { describe, expect, test } from "vitest";

import { answerLines, answerText } from "./answer-lines.js";

const WORDS = { yes: "Yes", no: "No" };

describe("answerLines", () => {
  test("names each answer, in the order the snapshot was taken", () => {
    const lines = answerLines(
      { email: "ada@example.test", name: "Ada" },
      { name: { label: "Your name" }, email: { label: "Email" } },
      WORDS,
    );

    expect(lines).toEqual([
      { path: "name", depth: 0, label: "Your name", text: "Ada" },
      { path: "email", depth: 0, label: "Email", text: "ada@example.test" },
    ]);
  });

  test("puts a group's members under a heading the group owns", () => {
    const lines = answerLines(
      { address: { city: "London" } },
      { address: { label: "Address", fields: { city: { label: "City" } } } },
      WORDS,
    );

    expect(lines).toEqual([
      { path: "address", depth: 0, label: "Address", text: null },
      { path: "address.city", depth: 1, label: "City", text: "London" },
    ]);
  });

  test("numbers repeater rows and reads each through the row's labels", () => {
    const lines = answerLines(
      { referees: [{ name: "Grace" }, { name: "Alan" }] },
      { referees: { label: "Referees", fields: { name: { label: "Name" } } } },
      WORDS,
    );

    expect(lines.map((line) => [line.depth, line.label, line.text])).toEqual([
      [0, "Referees", null],
      [1, "1", null],
      [2, "Name", "Grace"],
      [1, "2", null],
      [2, "Name", "Alan"],
    ]);
    expect(lines[2]?.path).toBe("referees.0.name");
  });

  test("leaves out a question nobody answered, and keeps an answer nobody named", () => {
    const lines = answerLines(
      { name: "Ada", legacy: "kept" },
      { name: { label: "Your name" }, phone: { label: "Phone" } },
      WORDS,
    );

    expect(lines.map((line) => line.label)).toEqual(["Your name", "legacy"]);
  });
});

describe("answerText", () => {
  test("says yes or no in the reader's own words", () => {
    expect(answerText(true, undefined, { yes: "Ja", no: "Nein" })).toBe("Ja");
    expect(answerText(false, undefined, { yes: "Ja", no: "Nein" })).toBe(
      "Nein",
    );
  });

  test("says what an option was called, not what it stored", () => {
    const plan = { label: "Plan", options: { pro: "Pro" } };

    expect(answerText("pro", plan, WORDS)).toBe("Pro");
    expect(answerText(["pro"], plan, WORDS)).toBe("Pro");
  });

  test("flattens a composite onto one line for a table cell", () => {
    const referees = {
      label: "Referees",
      fields: { name: { label: "Name" }, email: { label: "Email" } },
    };

    expect(
      answerText([{ name: "Grace" }, { name: "Alan" }], referees, WORDS),
    ).toBe("Grace; Alan");
    expect(
      answerText({ name: "Grace", email: "g@x.test" }, referees, WORDS),
    ).toBe("Grace, g@x.test");
  });

  test("renders an unanswered question as nothing at all", () => {
    expect(answerText(undefined, undefined, WORDS)).toBe("");
    expect(answerText(null, undefined, WORDS)).toBe("");
  });
});
