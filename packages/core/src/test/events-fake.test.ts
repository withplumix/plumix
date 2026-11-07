import { describe, expect, expectTypeOf, test } from "vitest";

import type { PartialMatch } from "./declared.js";
import type { EventsFake } from "./events-fake.js";
import { defineEvent } from "../events-and-filters/define.js";
import { scopeDeclarations } from "../events-and-filters/scope.js";
import { fakeEvents } from "./events-fake.js";

const order = {
  placed: defineEvent<{ readonly id: number; readonly total: number }>(
    "shop:placed",
  ),
  cancelled: defineEvent<{ readonly id: number }>("shop:cancelled"),
};
const giftOrder = scopeDeclarations(order, "gift");

describe("assertEmitted", () => {
  test("passes for an event emitted with a payload that has the keys asked for", () => {
    const events = fakeEvents();
    events.record(order.placed, { id: 1, total: 30 });

    expect(() => {
      events.assertEmitted(order.placed, { id: 1 });
    }).not.toThrow();
  });

  test("fails for another payload, listing the events emitted", () => {
    const events = fakeEvents();
    events.record(order.placed, { id: 1, total: 30 });

    expect(() => {
      events.assertEmitted(order.placed, { id: 2 });
    }).toThrow(
      'Expected event "shop:placed" to be emitted with {"id":2}, but it was not.\nEmitted:\n  - "shop:placed" {"id":1,"total":30}',
    );
  });

  test("says nothing was emitted when the site emitted nothing", () => {
    const events = fakeEvents();

    expect(() => {
      events.assertEmitted(order.placed);
    }).toThrow(
      'Expected event "shop:placed" to be emitted, but it was not.\nEmitted: nothing.',
    );
  });

  test("passes for an unscoped event emitted for any name", () => {
    const events = fakeEvents();
    events.record(giftOrder.placed, { id: 1, total: 30 });

    expect(() => {
      events.assertEmitted(order.placed);
    }).not.toThrow();
  });

  test("fails for a scoped event emitted for another name", () => {
    const events = fakeEvents();
    events.record(scopeDeclarations(order, "bulk").placed, {
      id: 1,
      total: 30,
    });

    expect(() => {
      events.assertEmitted(giftOrder.placed);
    }).toThrow(
      'Expected event "shop:placed" for "gift" to be emitted, but it was not.\nEmitted:\n  - "shop:placed" for "bulk"',
    );
  });

  test("takes the declared event, not its id", () => {
    expectTypeOf<string>().not.toExtend<
      Parameters<EventsFake["assertEmitted"]>[0]
    >();
  });

  test("takes only keys of the event's payload", () => {
    interface Payload {
      readonly id: number;
      readonly total: number;
    }

    expectTypeOf(fakeEvents().assertEmitted<Payload>)
      .parameter(1)
      .toEqualTypeOf<PartialMatch<Payload> | undefined>();
    expectTypeOf<{ sku: string }>().not.toExtend<PartialMatch<Payload>>();
  });
});

describe("assertNotEmitted", () => {
  test("passes when only another event was emitted", () => {
    const events = fakeEvents();
    events.record(order.placed, { id: 1, total: 30 });

    expect(() => {
      events.assertNotEmitted(order.cancelled);
    }).not.toThrow();
  });

  test("fails for an event emitted once, saying so", () => {
    const events = fakeEvents();
    events.record(order.cancelled, { id: 1 });

    expect(() => {
      events.assertNotEmitted(order.cancelled);
    }).toThrow(
      'Expected event "shop:cancelled" not to be emitted, but it was once.\nEmitted:\n  - "shop:cancelled" {"id":1}',
    );
  });

  test("fails for an event emitted more than once, saying how often", () => {
    const events = fakeEvents();
    events.record(order.cancelled, { id: 1 });
    events.record(order.cancelled, { id: 2 });

    expect(() => {
      events.assertNotEmitted(order.cancelled);
    }).toThrow(
      'Expected event "shop:cancelled" not to be emitted, but it was 2 times.',
    );
  });
});

describe("emitted", () => {
  test("lists each payload of the event, in order", () => {
    const events = fakeEvents();
    events.record(order.cancelled, { id: 1 });
    events.record(order.placed, { id: 2, total: 30 });
    events.record(order.cancelled, { id: 3 });

    expect(events.emitted(order.cancelled)).toEqual([{ id: 1 }, { id: 3 }]);
  });
});
