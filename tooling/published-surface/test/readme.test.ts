import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { cardFor, outsideSystems, publishedCards } from "../readme.js";

const readme = (dir: string): string =>
  readFileSync(join(dir, "README.md"), "utf8");

const plugins = publishedCards().filter(({ name }) =>
  name.startsWith("@plumix/plugin-"),
);

describe("package READMEs", () => {
  test.each(publishedCards().map((card) => [card.name, card] as const))(
    "%s is the card its package.json describes",
    (_name, card) => {
      const text = readme(card.dir);
      expect(text).toBe(cardFor(card, outsideSystems(text)));
    },
  );

  test("every published package but the umbrella has a card", () => {
    expect(publishedCards().map(({ name }) => name)).not.toContain("plumix");
    expect(publishedCards().length).toBeGreaterThan(0);
  });

  test("outsideSystems returns the whole section when it is the last one", () => {
    expect(outsideSystems("# x\n\n## Outside systems\n\nNothing.\n")).toBe(
      "Nothing.\n",
    );
  });

  test("outsideSystems stops at the next heading", () => {
    expect(
      outsideSystems("## Outside systems\n\nNothing.\n\n## Support\n"),
    ).toBe("Nothing.\n");
  });

  test("outsideSystems is undefined without the section", () => {
    expect(outsideSystems("# x\n\n## Support\n")).toBeUndefined();
  });

  test.each(plugins.map((card) => [card.name, card] as const))(
    "%s lists the outside systems it talks to",
    (_name, card) => {
      expect(outsideSystems(readme(card.dir))).toBeDefined();
    },
  );

  test.each(plugins.map((card) => [card.name, card] as const))(
    "%s cites the file that talks to each outside system it lists",
    (_name, card) => {
      const systems = (outsideSystems(readme(card.dir)) ?? "")
        .split("\n")
        .filter((line) => line.startsWith("- "));
      for (const system of systems) {
        const files = [...system.matchAll(/`(src\/[^`]+)`/g)].map(
          ([, file]) => file ?? "",
        );
        expect(files, system).not.toHaveLength(0);
        for (const file of files) {
          expect(existsSync(join(card.dir, file)), file).toBe(true);
        }
      }
    },
  );
});
