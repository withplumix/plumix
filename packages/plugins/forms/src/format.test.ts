import { describe, expect, test } from "vitest";

import { formatSubmission } from "./format.js";

describe("formatSubmission", () => {
  test("renders each answer under what its field was called", () => {
    const text = formatSubmission({
      answers: { name: "Ada", email: "ada@example.test", guests: 3 },
      labels: {
        name: { label: "Your name" },
        email: { label: "Email" },
        guests: { label: "Guests" },
      },
    });

    expect(text).toBe(
      ["Your name: Ada", "Email: ada@example.test", "Guests: 3"].join("\n"),
    );
  });

  test("follows the order the snapshot was taken in, not the answers'", () => {
    const text = formatSubmission({
      answers: { email: "ada@example.test", name: "Ada" },
      labels: { name: { label: "Your name" }, email: { label: "Email" } },
    });

    expect(text).toBe("Your name: Ada\nEmail: ada@example.test");
  });

  test("renders a choice as what the option was called", () => {
    const text = formatSubmission({
      answers: { plan: "pro", topics: ["news", "events"] },
      labels: {
        plan: { label: "Plan", options: { basic: "Basic", pro: "Pro" } },
        topics: {
          label: "Topics",
          options: { news: "News", events: "Events" },
        },
      },
    });

    expect(text).toBe("Plan: Pro\nTopics: News, Events");
  });

  test("renders a checkbox as yes or no", () => {
    const text = formatSubmission({
      answers: { newsletter: true, terms: false },
      labels: {
        newsletter: { label: "Newsletter" },
        terms: { label: "Terms" },
      },
    });

    expect(text).toBe("Newsletter: Yes\nTerms: No");
  });

  test("puts an answer that runs over several lines under its label", () => {
    const text = formatSubmission({
      answers: { message: "First line\nSecond line" },
      labels: { message: { label: "Message" } },
    });

    expect(text).toBe("Message:\n  First line\n  Second line");
  });

  test("renders repeater rows one at a time, under the row's own labels", () => {
    const text = formatSubmission({
      answers: {
        references: [
          { name: "Grace", email: "grace@example.test" },
          { name: "Alan", email: "alan@example.test" },
        ],
      },
      labels: {
        references: {
          label: "References",
          fields: { name: { label: "Name" }, email: { label: "Email" } },
        },
      },
    });

    expect(text).toBe(
      [
        "References:",
        "  1.",
        "    Name: Grace",
        "    Email: grace@example.test",
        "  2.",
        "    Name: Alan",
        "    Email: alan@example.test",
      ].join("\n"),
    );
  });

  // The shapes below are not what the form path produces — a repeater
  // stores one object per row — but `formatSubmission` is public and reads
  // whatever the answers column holds, so what it does with them is pinned
  // rather than left to the next refactor to decide.
  test("numbers a repeater row that is a bare value, like every other row", () => {
    const text = formatSubmission({
      answers: { references: [{ name: "Grace" }, "Alan"] },
      labels: {
        references: {
          label: "References",
          fields: { name: { label: "Name" } },
        },
      },
    });

    expect(text).toBe(
      ["References:", "  1.", "    Name: Grace", "  2. Alan"].join("\n"),
    );
  });

  test("leaves out the blanks in a list rather than the gaps they leave", () => {
    const text = formatSubmission({
      answers: { topics: ["news", "", null] },
      labels: { topics: { label: "Topics", options: { news: "News" } } },
    });

    expect(text).toBe("Topics: News");
  });

  test("renders a group's answers under the group", () => {
    const text = formatSubmission({
      answers: { address: { city: "London", postcode: "N1 1AA" } },
      labels: {
        address: {
          label: "Address",
          fields: { city: { label: "City" }, postcode: { label: "Postcode" } },
        },
      },
    });

    expect(text).toBe("Address:\n  City: London\n  Postcode: N1 1AA");
  });

  test("leaves out a question that was not answered", () => {
    const text = formatSubmission({
      answers: { name: "Ada" },
      labels: { name: { label: "Your name" }, phone: { label: "Phone" } },
    });

    expect(text).toBe("Your name: Ada");
  });

  test("falls back to the key for an answer the snapshot does not name", () => {
    const text = formatSubmission({
      answers: { name: "Ada", legacy: "kept" },
      labels: { name: { label: "Your name" } },
    });

    expect(text).toBe("Your name: Ada\nlegacy: kept");
  });
});
