import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import { HookRegistry } from "../../hooks/registry.js";
import { ThemeRegistrationError } from "../../theme-errors.js";
import { collectDevErrorHints } from "./collect.js";
import { registerCoreErrorHints } from "./core-hints.js";

const ctx = {} as AppContext;

function hintsFor(error: unknown): readonly string[] {
  const hooks = new HookRegistry();
  registerCoreErrorHints(hooks);
  return collectDevErrorHints(hooks, error, ctx).map((h) => h.title);
}

describe("registerCoreErrorHints", () => {
  test("surfaces a hint for a typed ThemeRegistrationError", () => {
    const hooks = new HookRegistry();
    registerCoreErrorHints(hooks);

    const hints = collectDevErrorHints(
      hooks,
      ThemeRegistrationError.missingTheme(),
      ctx,
    );
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

  test("matches a missing-secret error with a dev-vars hint", () => {
    const hints = hintsFor(
      new Error("Missing required secret: SESSION_SECRET"),
    );
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/secret/i);
  });

  test("matches a missing-binding error with a wrangler hint", () => {
    const hints = hintsFor(new Error("Missing binding: DB"));
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/binding/i);
  });

  test("the dev-vars hint mentions .dev.vars so the fix is concrete", () => {
    const hooks = new HookRegistry();
    registerCoreErrorHints(hooks);
    const [card] = collectDevErrorHints(
      hooks,
      new Error("Missing required secret: SESSION_SECRET"),
      ctx,
    );
    expect(card?.body).toContain(".dev.vars");
  });

  test("the migrations hint names the plumix migrate command", () => {
    const hooks = new HookRegistry();
    registerCoreErrorHints(hooks);
    const [card] = collectDevErrorHints(
      hooks,
      new Error("no such table: posts"),
      ctx,
    );
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

  test("a plugin can override a core hint by rewriting the list", () => {
    const hooks = new HookRegistry();
    registerCoreErrorHints(hooks);
    // A plugin runs after core and replaces the migrations hint with its own.
    hooks.addFilter(
      "error_page:hints",
      (hints) =>
        hints.map((h) =>
          h.title === "Run your migrations"
            ? { title: "Run our custom migrate task" }
            : h,
        ),
      { plugin: "demo" },
    );

    const titles = collectDevErrorHints(
      hooks,
      new Error("no such table: posts"),
      ctx,
    ).map((h) => h.title);
    expect(titles).toEqual(["Run our custom migrate task"]);
  });

  test("registers at low priority so plugin hints can rank above core", () => {
    const hooks = new HookRegistry();
    registerCoreErrorHints(hooks);
    // A plugin subscribes at the default priority (100) — higher number sorts
    // after core (10), but it can prepend to place its hint first.
    hooks.addFilter(
      "error_page:hints",
      (hints) => [{ title: "plugin override" }, ...hints],
      { plugin: "demo" },
    );

    const titles = collectDevErrorHints(
      hooks,
      new Error("no such table: posts"),
      ctx,
    ).map((h) => h.title);
    expect(titles[0]).toBe("plugin override");
  });
});
