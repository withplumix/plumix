import { describe, expect, test } from "vitest";

import { defineEvent, defineFilter } from "../events-and-filters/define.js";
import { HandlerRegistry } from "../events-and-filters/registry.js";
import { createTestContext } from "./context.js";
import { createTestDb } from "./harness.js";
import { bindFilterSpy, spyEvent, spyFilter } from "./spies.js";

const saved = defineEvent<{ readonly id: number }>("acme:saved");
const title = defineFilter<string, { readonly locale: string }>("acme:title", {
  sync: true,
});

describe("spyEvent", () => {
  test("records each payload the event was emitted with", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyEvent(handlers, saved);
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    await ctx.events.emit(saved, { id: 1 });
    await ctx.events.emit(saved, { id: 2 });

    expect(spy.calls).toEqual([{ payload: { id: 1 } }, { payload: { id: 2 } }]);
  });

  test("reads the most recent payload as lastPayload", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyEvent(handlers, saved);
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    await ctx.events.emit(saved, { id: 1 });

    await ctx.events.emit(saved, { id: 2 });

    expect(spy.lastPayload).toEqual({ id: 2 });
  });

  test("passes an assertion an emitted payload matches", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyEvent(handlers, saved);
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    await ctx.events.emit(saved, { id: 1 });
    await ctx.events.emit(saved, { id: 2 });

    expect(spy.assertCalledWith(({ id }) => id === 2)).toBe(spy);
  });

  test("fails an assertion no emitted payload matches", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyEvent(handlers, saved);
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    await ctx.events.emit(saved, { id: 1 });

    expect(() => spy.assertCalledWith(({ id }) => id === 2)).toThrow(
      "spyEvent(acme:saved): no call matched the supplied matcher",
    );
  });
});

describe("spyFilter on a declared filter", () => {
  test("records the value and the input, and passes the value through", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyFilter(handlers, title);
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    const result = ctx.filters.apply(title, "Home", { locale: "en" });

    expect({ result, calls: spy.calls }).toEqual({
      result: "Home",
      calls: [{ input: "Home", rest: [{ locale: "en" }] }],
    });
  });

  test("passes an assertion a call matches", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyFilter(handlers, title);
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    ctx.filters.apply(title, "Home", { locale: "en" });
    ctx.filters.apply(title, "About", { locale: "uk" });

    expect(spy.assertCalledWith((_value, { locale }) => locale === "uk")).toBe(
      spy,
    );
  });

  test("fails an assertion no call matches, naming the filter", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyFilter(handlers, title);
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    ctx.filters.apply(title, "Home", { locale: "en" });

    expect(() =>
      spy.assertCalledWith((_value, { locale }) => locale === "uk"),
    ).toThrow("spyFilter(acme:title): no call matched the supplied matcher");
  });

  test("returns what an override returns", async () => {
    const handlers = new HandlerRegistry();
    const spy = spyFilter(handlers, title);
    spy.override((value, input) => `${value} (${input.locale})`);
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    const result = ctx.filters.apply(title, "Home", { locale: "uk" });

    expect(result).toBe("Home (uk)");
  });
});

describe("bindFilterSpy", () => {
  test("spies a declared filter on the handlers it is bound to", async () => {
    const handlers = new HandlerRegistry();
    const spy = bindFilterSpy(handlers)(title);
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    ctx.filters.apply(title, "Home", { locale: "uk" });

    expect(spy.calls).toEqual([{ input: "Home", rest: [{ locale: "uk" }] }]);
  });
});
