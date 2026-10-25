import { beforeAll, describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { defineEvent, defineFilter } from "./define.js";
import { HookRegistry } from "./registry.js";

const saved = defineEvent<{ readonly id: number }>("acme:saved");
const title = defineFilter<string, { readonly locale: string }>("acme:title", {
  sync: false,
});
const label = defineFilter<string, { readonly locale: string }>("acme:label", {
  sync: true,
});

const ctx = createPluginSetupContext({
  pluginId: "acme",
  hooks: new HookRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});
let appCtx: AppContext;
beforeAll(async () => {
  appCtx = createTestContext({ db: await createTestDb() });
});

describe("declaring", () => {
  test("an id without an owner is rejected", () => {
    const declare = (): void => {
      // @ts-expect-error an id is `<owner>:<name>`
      defineEvent<string>("saved");
      // @ts-expect-error an id is `<owner>:<name>`
      defineFilter<string>("title", { sync: false });
    };
    expectTypeOf(declare).toBeFunction();
  });

  test("a filter states whether it is sync", () => {
    const declare = (): void => {
      // @ts-expect-error `{ sync }` is required
      defineFilter<string>("acme:title");
    };
    expectTypeOf(declare).toBeFunction();
  });
});

describe("subscribing", () => {
  test("an event handler is handed the payload and the request's ctx", () => {
    ctx.events.on(saved, (payload, handlerCtx) => {
      expectTypeOf(payload).toEqualTypeOf<{ readonly id: number }>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
  });

  test("a filter handler is handed the value, the input and the request's ctx", () => {
    ctx.filters.add(title, (value, input, handlerCtx) => {
      expectTypeOf(value).toEqualTypeOf<string>();
      expectTypeOf(input).toEqualTypeOf<
        Readonly<{ readonly locale: string }>
      >();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
      return value;
    });
  });

  test("a filter can't be passed to ctx.events.on", () => {
    // @ts-expect-error a filter is not an event
    ctx.events.on(title, () => undefined);
  });

  test("an event can't be passed to ctx.filters.add", () => {
    // @ts-expect-error an event is not a filter
    ctx.filters.add(saved, (value: unknown) => value);
  });

  test("a sync filter rejects a handler returning a promise", () => {
    // @ts-expect-error a sync filter's handler returns its value
    ctx.filters.add(label, (value) => Promise.resolve(value));
  });

  test("an async filter accepts a handler returning a promise", () => {
    ctx.filters.add(title, (value) => Promise.resolve(value));
  });

  test("an event handler can't take another event's payload", () => {
    // @ts-expect-error the payload is `{ id }`, not a string
    ctx.events.on(saved, (payload: string) => void payload);
  });
});

describe("firing", () => {
  test("a sync filter returns its value and an async one a promise of it", () => {
    expectTypeOf(
      appCtx.filters.apply(label, "x", { locale: "en" }),
    ).toEqualTypeOf<string>();
    expectTypeOf(
      appCtx.filters.apply(title, "x", { locale: "en" }),
    ).toEqualTypeOf<Promise<string>>();
  });

  test("emit takes the event's payload", () => {
    // @ts-expect-error the payload is `{ id }`
    void appCtx.events.emit(saved, { slug: "x" });
  });
});
