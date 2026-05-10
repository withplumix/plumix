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
    // Slice 179: full curated set landed.
    expect(typeof subjectExtractors.term).toBe("function");
    expect(typeof subjectExtractors.credential).toBe("function");
    expect(typeof subjectExtractors.api_token).toBe("function");
    expect(typeof subjectExtractors.session).toBe("function");
    expect(typeof subjectExtractors.device_code).toBe("function");
    expect(typeof subjectExtractors.settings_group).toBe("function");
    expect(subjectExtractors.unknown_kind_xyz).toBeUndefined();
  });

  test("term extractor prefers name, falls back to slug, then (unnamed)", () => {
    expect(
      extractSubject("term", { id: 1, name: "News", slug: "news" }),
    ).toEqual({ type: "term", id: "1", label: "News" });

    expect(extractSubject("term", { id: 2, name: null, slug: "tech" })).toEqual(
      { type: "term", id: "2", label: "tech" },
    );

    expect(extractSubject("term", { id: 3, name: "  ", slug: "  " })).toEqual({
      type: "term",
      id: "3",
      label: "(unnamed)",
    });
  });

  test("credential / api_token extractors prefer the user-set name", () => {
    expect(
      extractSubject("credential", { id: "abc", name: "My laptop" }),
    ).toEqual({ type: "credential", id: "abc", label: "My laptop" });

    expect(
      extractSubject("api_token", { id: "tok-1", name: "CI deploy" }),
    ).toEqual({ type: "api_token", id: "tok-1", label: "CI deploy" });
  });

  test("session extractor uses the fallback label (no human handle)", () => {
    expect(extractSubject("session", { id: "sess-uuid", name: null })).toEqual({
      type: "session",
      id: "sess-uuid",
      label: "(unnamed)",
    });
  });

  test("device_code extractor uses the userCode passed via title", () => {
    expect(
      extractSubject("device_code", { id: "dev-1", title: "ABCD-WXYZ" }),
    ).toEqual({ type: "device_code", id: "dev-1", label: "ABCD-WXYZ" });
  });

  test("settings_group extractor uses the group name as both id and label", () => {
    expect(extractSubject("settings_group", { id: "mailer" })).toEqual({
      type: "settings_group",
      id: "mailer",
      label: "mailer",
    });
  });
});
