import { describe, expect, test } from "vitest";

import { defineEvent, defineFilter } from "../hooks/define.js";
import { createRpcHarness } from "./rpc.js";

const saved = defineEvent<{ readonly id: number }>("acme:saved");
const title = defineFilter<string, { readonly locale: string }>("acme:title", {
  sync: true,
});

describe("createRpcHarness spies", () => {
  test("spyEvent records the payloads the context emits", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const spy = h.spyEvent(saved);

    await h.context.events.emit(saved, { id: 1 });

    expect(spy.calls).toEqual([{ payload: { id: 1 } }]);
  });

  test("spyFilter on a declared filter records the value and input and passes the value through", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const spy = h.spyFilter(title);

    const result = h.context.filters.apply(title, "Home", { locale: "uk" });

    expect(result).toBe("Home");
    expect(spy.calls).toEqual([{ input: "Home", rest: [{ locale: "uk" }] }]);
  });
});
