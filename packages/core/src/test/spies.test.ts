import { describe, expect, test } from "vitest";

import { defineEvent, defineFilter } from "../hooks/define.js";
import { HookRegistry } from "../hooks/registry.js";
import { createTestContext } from "./context.js";
import { createTestDb } from "./harness.js";
import { spyEvent, spyFilter } from "./spies.js";

const saved = defineEvent<{ readonly id: number }>("acme:saved");
const title = defineFilter<string, { readonly locale: string }>("acme:title", {
  sync: true,
});

describe("spyEvent", () => {
  test("records each payload the event was emitted with", async () => {
    const hooks = new HookRegistry();
    const spy = spyEvent(hooks, saved);
    const ctx = createTestContext({ db: await createTestDb(), hooks });

    await ctx.events.emit(saved, { id: 1 });
    await ctx.events.emit(saved, { id: 2 });

    expect(spy.calls).toEqual([{ payload: { id: 1 } }, { payload: { id: 2 } }]);
  });

  test("fails an assertion no emitted payload matches", async () => {
    const hooks = new HookRegistry();
    const spy = spyEvent(hooks, saved);
    const ctx = createTestContext({ db: await createTestDb(), hooks });
    await ctx.events.emit(saved, { id: 1 });

    expect(() => spy.assertCalledWith(({ id }) => id === 2)).toThrow(
      "spyEvent(acme:saved): no call matched the supplied matcher",
    );
  });
});

describe("spyFilter on a declared filter", () => {
  test("records the value and the input, and passes the value through", async () => {
    const hooks = new HookRegistry();
    const spy = spyFilter(hooks, title);
    const ctx = createTestContext({ db: await createTestDb(), hooks });

    const result = ctx.filters.apply(title, "Home", { locale: "en" });

    expect({ result, calls: spy.calls }).toEqual({
      result: "Home",
      calls: [{ input: "Home", rest: [{ locale: "en" }] }],
    });
  });

  test("returns what an override returns", async () => {
    const hooks = new HookRegistry();
    const spy = spyFilter(hooks, title);
    spy.override((value, input) => `${value} (${input.locale})`);
    const ctx = createTestContext({ db: await createTestDb(), hooks });

    const result = ctx.filters.apply(title, "Home", { locale: "uk" });

    expect(result).toBe("Home (uk)");
  });
});
