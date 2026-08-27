import { describe, expect, test } from "vitest";

import { cardKey } from "./card-key.js";

const entry = { id: 12, updatedAt: new Date("2026-08-01T00:00:00Z") };

describe("the key helpers", () => {
  test("emit the card's id and the cache tag from one call", () => {
    expect(cardKey.of("home", "en")).toEqual({
      id: "home--en",
      tag: "og:home--en",
    });
  });

  test("give an entry card the tag that purges that entry", () => {
    const key = cardKey.entry(entry);

    expect(key.tag).toBe("e:12");
    expect(key.id).toContain("12");
  });

  test("reduce a part to what a URL path and a cache tag both accept", () => {
    expect(cardKey.of("Hello, World!").id).toBe("hello-world");
  });

  test("reduce a part that is nothing but separators", () => {
    expect(cardKey.of("---").id).toBe("x");
  });

  test("keep two different readings off one key", () => {
    expect(cardKey.of("a-b", "c").id).not.toBe(cardKey.of("a", "b-c").id);
  });

  test("move an entry card's id when the entry is edited", () => {
    const edited = { ...entry, updatedAt: new Date("2026-08-02T00:00:00Z") };

    expect(cardKey.entry(edited).id).not.toBe(cardKey.entry(entry).id);
  });

  test("fold what else a card read into the id, leaving the tag alone", () => {
    const withSite = cardKey.entry(entry, "Example Site");

    expect(withSite.id).not.toBe(cardKey.entry(entry).id);
    expect(withSite.tag).toBe(cardKey.entry(entry).tag);
  });
});
