import { describe, expect, test } from "vitest";

import { cardKey } from "./card-key.js";

const entry = { id: 12, updatedAt: new Date("2026-08-01T00:00:00Z") };

describe("the key helpers", () => {
  test("emit the URL hash and the cache tag from one call", () => {
    expect(cardKey.of("home", "en")).toEqual({
      hash: "home--en",
      tag: "og:home--en",
    });
  });

  test("give an entry card the tag that purges that entry", () => {
    const key = cardKey.entry(entry);

    expect(key.tag).toBe("e:12");
    expect(key.hash).toContain("12");
  });

  test("reduce a part to what a URL path and a cache tag both accept", () => {
    expect(cardKey.of("Hello, World!").hash).toBe("hello-world");
  });

  test("reduce a part that is nothing but separators", () => {
    expect(cardKey.of("---").hash).toBe("x");
  });

  test("keep two different readings off one key", () => {
    expect(cardKey.of("a-b", "c").hash).not.toBe(cardKey.of("a", "b-c").hash);
  });

  test("move an entry card's hash when the entry is edited", () => {
    const edited = { ...entry, updatedAt: new Date("2026-08-02T00:00:00Z") };

    expect(cardKey.entry(edited).hash).not.toBe(cardKey.entry(entry).hash);
  });

  test("fold what else a card read into the hash, leaving the tag alone", () => {
    const withSite = cardKey.entry(entry, "Example Site");

    expect(withSite.hash).not.toBe(cardKey.entry(entry).hash);
    expect(withSite.tag).toBe(cardKey.entry(entry).tag);
  });
});
