import { describe, expect, test } from "vitest";

import type { TitleVariables } from "./title-pattern.js";
import { renderTitlePattern, TITLE_VARIABLES } from "./title-pattern.js";

const vars = (overrides: Partial<TitleVariables> = {}): TitleVariables => ({
  title: "Hello",
  sitename: "Demo",
  sep: "·",
  term: "",
  author: "",
  date: "",
  searchphrase: "",
  count: "",
  ...overrides,
});

describe("renderTitlePattern", () => {
  test("substitutes every variable it is given", () => {
    expect(
      renderTitlePattern(
        "%%title%% %%sep%% %%term%% %%author%% %%date%% %%searchphrase%% %%count%% %%sitename%%",
        vars({
          term: "News",
          author: "Ada",
          date: "July 2026",
          searchphrase: "dough",
          count: "12",
        }),
      ),
    ).toBe("Hello · News Ada July 2026 dough 12 Demo");
  });

  test("an unknown variable is dropped, not emitted raw", () => {
    // Mis-casing is the likeliest author slip, so anything in `%%…%%` shape is
    // recognised as a variable and dropped — not just the lowercase misses.
    for (const name of ["nope", "Title", "TITLE", "term-title", "title2"]) {
      expect(renderTitlePattern(`%%title%% %%${name}%%`, vars())).toBe("Hello");
    }
  });

  test("a lone pair of percent signs is not a variable", () => {
    expect(renderTitlePattern("100%% sure %%title%%", vars())).toBe(
      "100%% sure Hello",
    );
  });

  test("a separator left orphaned in the middle is collapsed away", () => {
    expect(
      renderTitlePattern(
        "%%title%% %%sep%% %%term%% %%sep%% %%sitename%%",
        vars(),
      ),
    ).toBe("Hello · Demo");
  });

  test("a separator the page's own text contains is left alone", () => {
    expect(
      renderTitlePattern("%%title%%", vars({ title: "Rock -", sep: "-" })),
    ).toBe("Rock -");
  });

  test("a variable with no value for this page is dropped", () => {
    expect(renderTitlePattern("%%term%% %%sep%% %%sitename%%", vars())).toBe(
      "Demo",
    );
  });

  test("a separator left orphaned at either end is trimmed away", () => {
    expect(renderTitlePattern("%%sep%% %%title%% %%sep%%", vars())).toBe(
      "Hello",
    );
  });

  test("collapses the whitespace a dropped variable leaves behind", () => {
    expect(
      renderTitlePattern("%%title%%  %%term%%   %%sitename%%", vars()),
    ).toBe("Hello Demo");
  });

  test("a pattern that resolves to nothing at all is no title", () => {
    expect(renderTitlePattern("%%term%% %%sep%%", vars())).toBeNull();
  });

  test("an empty pattern is no title", () => {
    expect(renderTitlePattern("", vars())).toBeNull();
    expect(renderTitlePattern("   ", vars())).toBeNull();
  });

  test("text around the variables is kept verbatim", () => {
    expect(renderTitlePattern("Read: %%title%% (%%sitename%%)", vars())).toBe(
      "Read: Hello (Demo)",
    );
  });

  test("every documented variable is substitutable", () => {
    for (const name of TITLE_VARIABLES) {
      const filled = vars({ sep: "-", [name]: "X" });
      // `sep` alone is a title made of nothing but punctuation, so it is read
      // through a pattern that has something for it to separate.
      expect(renderTitlePattern(`a %%${name}%% b`, filled)).toBe("a X b");
    }
  });
});
