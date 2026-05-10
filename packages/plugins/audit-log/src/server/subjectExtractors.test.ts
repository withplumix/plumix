import { describe, expect, test } from "vitest";

import { extractSubject, subjectExtractors } from "./subjectExtractors.js";

describe("extractSubject", () => {
  test("entry extractor prefers title, falls back to slug, then (unnamed)", () => {
    expect(
      extractSubject("entry", { id: 1, title: "Hello", slug: "hello" }),
    ).toEqual({ type: "entry", id: "1", label: "Hello" });

    expect(
      extractSubject("entry", { id: 2, title: null, slug: "no-title" }),
    ).toEqual({ type: "entry", id: "2", label: "no-title" });

    expect(extractSubject("entry", { id: 3, title: "  ", slug: "  " })).toEqual(
      { type: "entry", id: "3", label: "(unnamed)" },
    );
  });

  test("user extractor prefers name, falls back to email", () => {
    expect(
      extractSubject("user", {
        id: 5,
        name: "Alice",
        email: "alice@example.com",
      }),
    ).toEqual({ type: "user", id: "5", label: "Alice" });

    expect(
      extractSubject("user", {
        id: 6,
        name: null,
        email: "bob@example.com",
      }),
    ).toEqual({ type: "user", id: "6", label: "bob@example.com" });
  });

  test("unknown subject types fall through with their best-effort label", () => {
    // Plugins shipping their own subject types (term, comment, ...)
    // should ideally register an extractor, but the unknown path
    // surfaces a row regardless so the feed never loses an event.
    expect(extractSubject("term", { id: 9, name: "Tag" })).toEqual({
      type: "term",
      id: "9",
      label: "Tag",
    });

    expect(extractSubject("ufo", { id: 10 })).toEqual({
      type: "ufo",
      id: "10",
      label: "(unnamed)",
    });
  });

  test("subjectExtractors map exposes per-type extractors directly", () => {
    expect(typeof subjectExtractors.entry).toBe("function");
    expect(typeof subjectExtractors.user).toBe("function");
    expect(subjectExtractors.term).toBeUndefined();
  });
});
