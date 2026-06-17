import { describe, expect, it, vi } from "vitest";

import type { AppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { HookRegistry } from "../hooks/registry.js";
import {
  enqueuePurgeTags,
  flushPurgeTags,
  registerCorePurgeInvalidator,
} from "./purge.js";

function fakeCtx(withCache = true) {
  const purgeTags = vi.fn(() => Promise.resolve());
  const defer = vi.fn((p: Promise<unknown>) => {
    void p;
  });
  const ctx = {
    cache: withCache ? { match: vi.fn(), put: vi.fn(), purgeTags } : undefined,
    defer,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  } as unknown as AppContext;
  return { ctx, purgeTags, defer };
}

describe("purge accumulator", () => {
  it("flushes a single de-duplicated purge for tags from multiple enqueues", () => {
    const { ctx, purgeTags } = fakeCtx();

    // Two entries of the same type — the bulk-publish shape.
    enqueuePurgeTags(ctx, ["t:post", "e:1"]);
    enqueuePurgeTags(ctx, ["t:post", "e:2"]);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledTimes(1);
    expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:1", "e:2"]);
  });

  it("does nothing on flush when nothing was enqueued", () => {
    const { ctx, purgeTags, defer } = fakeCtx();
    flushPurgeTags(ctx);
    expect(purgeTags).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });

  it("is inert when no cache is configured", () => {
    const { ctx, defer } = fakeCtx(false);
    enqueuePurgeTags(ctx, ["t:post", "e:1"]);
    flushPurgeTags(ctx);
    expect(defer).not.toHaveBeenCalled();
  });
});

describe("registerCorePurgeInvalidator", () => {
  const ENTRY_EVENTS = [
    "entry:published",
    "entry:updated",
    "entry:meta_changed",
    "entry:trashed",
    "entry:restored",
    "entry:deleted",
  ] as const;

  it.each(ENTRY_EVENTS)("%s enqueues the entry's purge tags", async (event) => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, purgeTags } = fakeCtx();

    await requestStore.run(ctx, () =>
      hooks.doAction(
        event as never,
        { id: 9, type: "post" } as never,
        { id: 9, type: "post" } as never,
      ),
    );
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:9"]);
  });

  it("batches a bulk publish into one purge call", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, purgeTags } = fakeCtx();

    await requestStore.run(ctx, async () => {
      await hooks.doAction("entry:published", { id: 1, type: "post" } as never);
      await hooks.doAction("entry:published", { id: 2, type: "post" } as never);
    });
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledTimes(1);
    expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:1", "e:2"]);
  });
});
