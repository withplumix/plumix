import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { cardFor, publishedCards } from "../readme.js";

describe("package READMEs", () => {
  test.each(publishedCards().map((card) => [card.name, card] as const))(
    "%s is the card its package.json describes",
    (_name, card) => {
      expect(readFileSync(join(card.dir, "README.md"), "utf8")).toBe(
        cardFor(card),
      );
    },
  );

  test("every published package but the umbrella has a card", () => {
    expect(publishedCards().map(({ name }) => name)).not.toContain("plumix");
    expect(publishedCards().length).toBeGreaterThan(0);
  });
});
