import { describe, expect, test, vi } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { createTestContext, silentLogger } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { defineEvent, defineFilter } from "./define.js";
import { HandlerRegistry } from "./registry.js";

const trail = defineFilter<readonly string[]>("test:trail", { sync: true });
const noticed = defineEvent<{ readonly note: string }>("test:noticed");

function appendTo(step: string) {
  return (value: readonly string[]): readonly string[] => [...value, step];
}

describe("ctx.filters.apply", () => {
  test("runs early, then normal, then late, and within each core first, then config order, then registration order", async () => {
    const handlers = new HandlerRegistry();
    const first = definePlugin("first", {
      setup: (ctx) => {
        ctx.filters.add(trail, appendTo("first:late"), { order: "late" });
      },
      afterSetup: (ctx) => {
        ctx.filters.add(trail, appendTo("first"));
      },
    });
    const second = definePlugin("second", {
      setup: (ctx) => {
        ctx.filters.add(trail, appendTo("second:a"));
        ctx.filters.add(trail, appendTo("second:b"));
        ctx.filters.add(trail, appendTo("second:early"), { order: "early" });
      },
    });
    await installPlugins({ handlers, plugins: [first, second] });
    handlers.add(trail, appendTo("core"));
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    const result = ctx.filters.apply(trail, []);

    expect(result).toEqual([
      "second:early",
      "core",
      "first",
      "second:a",
      "second:b",
      "first:late",
    ]);
  });
});

describe("a throwing filter handler", () => {
  test.each([
    ["sync", defineFilter<number>("test:sync-veto", { sync: true })],
    ["async", defineFilter<number>("test:async-veto", { sync: false })],
  ] as const)(
    "reaches the caller of a %s filter unchanged",
    async (_kind, filter) => {
      const veto = new Error("vetoed");
      const handlers = new HandlerRegistry();
      handlers.add(filter, () => {
        throw veto;
      });
      const ctx = createTestContext({ db: await createTestDb(), handlers });

      const run = async (): Promise<number> => ctx.filters.apply(filter, 1);

      await expect(run()).rejects.toBe(veto);
    },
  );
});

describe("an async filter", () => {
  test("hands each handler its own copy, so a mutation can't reach the next", async () => {
    const counter = defineFilter<{ count: number }>("test:counter", {
      sync: false,
    });
    const seen: number[] = [];
    const handlers = new HandlerRegistry();
    handlers.add(counter, (value) => {
      value.count = 99;
      return { count: 1 };
    });
    handlers.add(counter, (value) => {
      seen.push(value.count);
      value.count = 50;
      return value;
    });
    const ctx = createTestContext({ db: await createTestDb(), handlers });
    const original = { count: 0 };

    const result = await ctx.filters.apply(counter, original);

    expect({ original, seen, result }).toEqual({
      original: { count: 0 },
      seen: [1],
      result: { count: 50 },
    });
  });

  test("passes the input and the context to every handler", async () => {
    const titled = defineFilter<string, { readonly suffix: string }>(
      "test:titled",
      { sync: false },
    );
    const handlers = new HandlerRegistry();
    handlers.add(
      titled,
      (value, input, handlerCtx) =>
        `${value}${input.suffix} @ ${new URL(handlerCtx.request.url).pathname}`,
    );
    const ctx = createTestContext({
      db: await createTestDb(),
      handlers,
      request: new Request("https://cms.example/about"),
    });

    const result = await ctx.filters.apply(titled, "Home", { suffix: "!" });

    expect(result).toBe("Home! @ /about");
  });
});

describe("telemetry", () => {
  test("records one span per event and async filter handler, naming the id and the plugin", async () => {
    const counted = defineFilter<number>("test:counted", { sync: false });
    const handlers = new HandlerRegistry();
    const plugin = definePlugin("tracer", {
      setup: (ctx) => {
        ctx.events.on(noticed, () => {
          throw new Error("boom");
        });
        ctx.filters.add(counted, (value) => value + 1);
      },
    });
    await installPlugins({ handlers, plugins: [plugin] });
    const ctx = createTestContext({
      db: await createTestDb(),
      handlers,
      config: { telemetry: { consumers: [{ id: "probe" }] } },
    });

    await ctx.events.emit(noticed, { note: "hi" });
    await ctx.filters.apply(counted, 1);

    expect(
      ctx.telemetry.getSpans().map((span) => ({
        name: span.name,
        attributes: span.attributes,
        status: span.status,
      })),
    ).toEqual([
      {
        name: "event: test:noticed",
        attributes: { "event.id": "test:noticed", "event.plugin": "tracer" },
        status: "error",
      },
      {
        name: "filter: test:counted",
        attributes: { "filter.id": "test:counted", "filter.plugin": "tracer" },
        status: "ok",
      },
    ]);
  });
});

describe("getEventHandlers", () => {
  const saved = defineEvent<{ readonly id: number }>("test:saved");

  test("returns an empty array when nothing subscribed", () => {
    expect(new HandlerRegistry().getEventHandlers(saved)).toEqual([]);
  });

  test("returns each handler with its plugin, in the order emit starts them", () => {
    const registry = new HandlerRegistry();
    const late = () => undefined;
    const normal = () => undefined;
    registry.on(saved, late, { plugin: "b", order: "late" });
    registry.on(saved, normal);

    expect(registry.getEventHandlers(saved)).toEqual([
      { handler: normal, plugin: null },
      { handler: late, plugin: "b" },
    ]);
  });
});

describe("ctx.events.emit", () => {
  test("starts handlers early, then normal, then late, and within each core first, then config order, then registration order", async () => {
    const started: string[] = [];
    const record = (step: string) => () => {
      started.push(step);
    };
    const handlers = new HandlerRegistry();
    const first = definePlugin("first", {
      setup: (ctx) => {
        ctx.events.on(noticed, record("first:late"), { order: "late" });
      },
      afterSetup: (ctx) => {
        ctx.events.on(noticed, record("first"));
      },
    });
    const second = definePlugin("second", {
      setup: (ctx) => {
        ctx.events.on(noticed, record("second:a"));
        ctx.events.on(noticed, record("second:b"));
        ctx.events.on(noticed, record("second:early"), { order: "early" });
      },
    });
    await installPlugins({ handlers, plugins: [first, second] });
    handlers.on(noticed, record("core"));
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    await ctx.events.emit(noticed, { note: "hi" });

    expect(started).toEqual([
      "second:early",
      "core",
      "first",
      "second:a",
      "second:b",
      "first:late",
    ]);
  });
});

describe("a failing event handler", () => {
  const faulty = definePlugin("faulty", {
    setup: (ctx) => {
      ctx.events.on(noticed, () => {
        throw new Error("subscriber blew up");
      });
    },
  });

  test("is reported by emit while the other handlers still run", async () => {
    const heard: string[] = [];
    const listener = definePlugin("listener", {
      setup: (ctx) => {
        ctx.events.on(noticed, ({ note }) => {
          heard.push(note);
        });
      },
    });
    const handlers = new HandlerRegistry();
    await installPlugins({ handlers, plugins: [faulty, listener] });
    const ctx = createTestContext({ db: await createTestDb(), handlers });

    const failures = await ctx.events.emit(noticed, { note: "hi" });

    expect(failures).toEqual([
      { plugin: "faulty", error: new Error("subscriber blew up") },
    ]);
    expect(heard).toEqual(["hi"]);
  });

  test("is logged through the context's logger, naming the event and the plugin", async () => {
    const error = vi.fn();
    const handlers = new HandlerRegistry();
    await installPlugins({ handlers, plugins: [faulty] });
    const ctx = createTestContext({
      db: await createTestDb(),
      handlers,
      logger: { ...silentLogger, error },
    });

    await ctx.events.emit(noticed, { note: "hi" });

    expect(error.mock.calls).toEqual([
      [
        "[plumix] event failed event=test:noticed plugin=faulty: subscriber blew up",
        {
          event: "test:noticed",
          plugin: "faulty",
          error: new Error("subscriber blew up"),
          requestId: ctx.requestId,
        },
      ],
    ]);
  });

  test("is logged as core's own when no plugin subscribed it", async () => {
    const error = vi.fn();
    const handlers = new HandlerRegistry();
    handlers.on(noticed, () => Promise.reject(new Error("boom")));
    const ctx = createTestContext({
      db: await createTestDb(),
      handlers,
      logger: { ...silentLogger, error },
    });

    const failures = await ctx.events.emit(noticed, { note: "hi" });

    expect(failures).toEqual([{ plugin: null, error: new Error("boom") }]);
    expect(error.mock.calls[0]?.[0]).toBe(
      "[plumix] event failed event=test:noticed plugin=core: boom",
    );
  });
});
