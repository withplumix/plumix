import { describe, expect, test } from "vitest";

import { ThemeRegistrationError } from "../../../theme-errors.js";
import { matchCoreErrorHints } from "./core-hints.js";

function hintsFor(error: unknown): readonly string[] {
  return matchCoreErrorHints(error).map((h) => h.title);
}

describe("matchCoreErrorHints", () => {
  test("surfaces a hint for a typed ThemeRegistrationError", () => {
    const hints = matchCoreErrorHints(ThemeRegistrationError.missingTheme());
    expect(hints.length).toBeGreaterThan(0);
    const [card] = hints;
    expect(card?.title).toMatch(/theme/i);
    expect(card?.body).toBeDefined();
  });

  test("matches a D1 'no such table' error with a run-migrations hint", () => {
    const err = new Error("D1_ERROR: no such table: posts: SQLITE_ERROR");
    const hints = hintsFor(err);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/migrat/i);
  });

  test("matches a missing-secret error with an env-file hint", () => {
    const hints = hintsFor(
      new Error("Missing required secret: SESSION_SECRET"),
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/secret/i);
  });

  test("the env-file hint mentions .env so the fix is concrete", () => {
    const [card] = matchCoreErrorHints(
      new Error("Missing required secret: SESSION_SECRET"),
    );
    expect(card?.body).toContain("`.env`");
  });

  test("the migrations hint names the plumix migrate command", () => {
    const [card] = matchCoreErrorHints(new Error("no such table: posts"));
    expect(card?.body).toContain("plumix migrate");
  });

  test("contributes nothing for an unrecognized error", () => {
    expect(
      hintsFor(new TypeError("cannot read properties of undefined")),
    ).toEqual([]);
  });

  test("tolerates a non-Error throw without matching", () => {
    expect(hintsFor("just a string")).toEqual([]);
    expect(hintsFor(undefined)).toEqual([]);
  });
});
