import { describe, expect, test } from "vitest";

import type { AppContext } from "../../../context/app.js";
import type { DevErrorHint } from "../../ui/index.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { collectDevErrorHints } from "./collect.js";

// collect passes ctx opaquely to handlers; these tests never read it.
const ctx = {} as AppContext;

function hint(title: string): DevErrorHint {
  return { title };
}

describe("collectDevErrorHints", () => {
  test("returns an empty array when nothing is subscribed", () => {
    const hooks = new HookRegistry();

    expect(collectDevErrorHints(hooks, new Error("boom"), ctx)).toEqual([]);
  });

  test("passes the thrown error to each handler and returns its contributions", () => {
    const hooks = new HookRegistry();
    const seen: unknown[] = [];
    hooks.addFilter("error_page:hints", (hints, error) => {
      seen.push(error);
      return [...hints, hint("do the thing")];
    });

    const err = new Error("boom");
    expect(collectDevErrorHints(hooks, err, ctx).map((h) => h.title)).toEqual([
      "do the thing",
    ]);
    expect(seen).toEqual([err]);
  });

  test("isolates a throwing handler so one bad subscriber can't sink the rest", () => {
    const hooks = new HookRegistry();
    hooks.addFilter("error_page:hints", () => {
      throw new Error("subscriber blew up");
    });
    hooks.addFilter("error_page:hints", (hints) => [
      ...hints,
      hint("survives"),
    ]);

    expect(
      collectDevErrorHints(hooks, new Error("boom"), ctx).map((h) => h.title),
    ).toEqual(["survives"]);
  });
});
