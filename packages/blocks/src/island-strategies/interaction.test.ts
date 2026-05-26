import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PlumixIslandElement } from "../island-element.js";
import { interactionStrategy } from "./interaction.js";

// A single document-level capture listener is registered once at module
// load and persists across tests; each test registers its own island and
// tears it down, so the registry never leaks between cases. rAF is stubbed
// to run synchronously so replay is observable without a real frame.
const cleanups: (() => void)[] = [];

function register(
  el: PlumixIslandElement,
  opts: Readonly<Record<string, unknown>> = {},
): { loadFn: ReturnType<typeof vi.fn>; resolve: () => void } {
  // `loadFn` is invoked lazily (on the trigger), so capture its resolver
  // through a holder and return a stable `resolve` that calls the latest.
  let resolver: (() => void) | undefined;
  const loadFn = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolver = r;
      }),
  );
  const cleanup = interactionStrategy(loadFn, opts, el);
  if (typeof cleanup === "function") cleanups.push(cleanup);
  return { loadFn, resolve: () => resolver?.() };
}

function makeIsland(): {
  island: PlumixIslandElement;
  button: HTMLButtonElement;
} {
  const island = document.createElement("plumix-island") as PlumixIslandElement;
  const button = document.createElement("button");
  island.appendChild(button);
  document.body.appendChild(island);
  return { island, button };
}

// Let the `loadFn().then(replay)` microtask + the (sync-stubbed) rAF run.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("interactionStrategy", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("defers hydration until a click, suppresses the dead-DOM event, then replays it", async () => {
    const { island, button } = makeIsland();
    const seen: string[] = [];
    button.addEventListener("click", () => seen.push("click"));
    const { loadFn, resolve } = register(island);

    const notCancelled = button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    // The triggering click is fully suppressed on the un-hydrated DOM.
    expect(notCancelled).toBe(false);
    expect(seen).toEqual([]);
    expect(loadFn).toHaveBeenCalledTimes(1);

    resolve();
    await flush();

    // After hydration the captured click is replayed onto the button.
    expect(seen).toEqual(["click"]);
  });

  test("queues events arriving between trigger and hydration (hover→click is not lost)", async () => {
    const { island, button } = makeIsland();
    const seen: string[] = [];
    button.addEventListener("click", () => seen.push("click"));
    const { loadFn, resolve } = register(island);

    // pointerenter triggers hydration but doesn't bubble → not replayed.
    button.dispatchEvent(new Event("pointerenter", { bubbles: false }));
    expect(loadFn).toHaveBeenCalledTimes(1);

    // The real click lands while the chunk is still loading. Nuxt loses it;
    // we queue it.
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(loadFn).toHaveBeenCalledTimes(1); // second event doesn't re-trigger
    expect(seen).toEqual([]);

    resolve();
    await flush();
    expect(seen).toEqual(["click"]);
  });

  test("reconstructs the replayed event via its own constructor (keyboard data survives)", async () => {
    const { island, button } = makeIsland();
    const replayed: KeyboardEvent[] = [];
    button.addEventListener("keydown", (e) => replayed.push(e));
    const { resolve } = register(island, { events: ["keydown"] });

    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    resolve();
    await flush();

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toBeInstanceOf(KeyboardEvent);
    expect(replayed[0]?.key).toBe("Enter");
    expect(replayed[0]?.code).toBe("Enter");
  });

  test("re-applies .focus() after replaying a focus event (suppressed native side-effect)", async () => {
    const { island, button } = makeIsland();
    const focusSpy = vi.spyOn(button, "focus");
    const { resolve } = register(island, { events: ["focusin"] });

    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    resolve();
    await flush();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores events outside any registered island", () => {
    makeIsland(); // an island exists, but we click elsewhere
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const { loadFn } = register(
      document.createElement("plumix-island") as PlumixIslandElement,
    );

    const notCancelled = outside.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(notCancelled).toBe(true);
    expect(loadFn).not.toHaveBeenCalled();
  });

  test("teardown unregisters the island so later events are ignored", () => {
    const { island, button } = makeIsland();
    const loadFn = vi.fn(() => Promise.resolve());
    const cleanup = interactionStrategy(loadFn, {}, island);

    (cleanup as () => void)();
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(loadFn).not.toHaveBeenCalled();
  });

  test("hydrates the nearest island and replays onto a nested target", async () => {
    const { island, button } = makeIsland();
    const span = document.createElement("span");
    button.appendChild(span);
    const seen: (EventTarget | null)[] = [];
    span.addEventListener("click", (e) => seen.push(e.target));
    const { resolve } = register(island);

    span.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    resolve();
    await flush();

    expect(seen).toEqual([span]);
  });
});
