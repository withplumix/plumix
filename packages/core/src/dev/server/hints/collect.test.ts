import { beforeAll, describe, expect, onTestFinished, test, vi } from "vitest";

import type { AppContext } from "../../../context/app-context.js";
import type { DevErrorHint } from "../../ui/index.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { createTestContext } from "../../../test/context.js";
import { createTestDb } from "../../../test/harness.js";
import { collectDevErrorHints } from "./collect.js";

/** Handlers receive the request context; these tests never read it. */
let ctx: AppContext;
beforeAll(async () => {
  ctx = createTestContext({ db: await createTestDb() });
});

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
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => error.mockRestore());
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
    expect(error).toHaveBeenCalledWith(
      "[plumix] error_page:hints handler failed plugin=core",
      expect.objectContaining({ message: "subscriber blew up" }),
    );
  });
});
