import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "../context/app.js";
import { withUser } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredTermTaxonomy } from "../plugin/registry.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import {
  enqueuePurgeTags,
  flushPurgeTags,
  registerCorePurgeInvalidator,
} from "./purge.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

function fakeCtx(cdn: "purges" | "cannot-purge" | "absent" = "purges") {
  const purgeTags = vi.fn(() => Promise.resolve());
  const defer = vi.fn((p: Promise<unknown>) => {
    void p;
  });
  const store = { match: vi.fn(), put: vi.fn() };
  const plugins = createPluginRegistry();
  plugins.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy(
      "category",
      { label: "Categories", entryTypes: ["post"] },
      "test",
    ),
  );
  const ctx = createTestContext({
    db,
    cdn:
      cdn === "absent"
        ? undefined
        : {
            decorate: vi.fn(),
            store,
            ...(cdn === "purges" ? { purgeTags } : {}),
          },
    defer,
    plugins,
  });
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

  // Core derives contexts by spreading — basePath stripping, `withUser`, the
  // formPost session swap — and the flush runs against the outermost one. A
  // handler handed a derived context would otherwise fill a set nothing reads.
  it("flushes tags enqueued against a derived context", () => {
    const { ctx, purgeTags } = fakeCtx();
    const derived = withUser(ctx, {
      id: 1,
      email: "u@cms.example",
      role: "admin",
      meta: {},
    });

    enqueuePurgeTags(derived, ["t:post", "e:1"]);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:1"]);
  });

  it("does nothing on flush when nothing was enqueued", () => {
    const { ctx, purgeTags, defer } = fakeCtx();
    flushPurgeTags(ctx);
    expect(purgeTags).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });

  it("is inert when no cdn is configured", () => {
    const { ctx, defer } = fakeCtx("absent");
    enqueuePurgeTags(ctx, ["t:post", "e:1"]);
    flushPurgeTags(ctx);
    expect(defer).not.toHaveBeenCalled();
  });

  // A vendor that cannot invalidate by tag has no `purgeTags` at all, which is
  // the point of its being optional: nothing can call it and report success.
  it("is inert when the provider cannot purge by tag", () => {
    const { ctx, defer, purgeTags } = fakeCtx("cannot-purge");
    enqueuePurgeTags(ctx, ["t:post", "e:1"]);
    flushPurgeTags(ctx);
    expect(purgeTags).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });
});

describe("registerCorePurgeInvalidator", () => {
  // Loose-typed: each action's payload differs, so the tests fire by name.
  const fire = (hooks: HookRegistry, name: string, ...args: unknown[]) =>
    (hooks.doAction as (n: string, ...a: unknown[]) => Promise<void>).call(
      hooks,
      name,
      ...args,
    );

  const entry = { id: 9, type: "post" };
  const changes = { set: {}, removed: [] };
  const ENTRY_EVENTS: readonly (readonly [string, readonly unknown[]])[] = [
    ["entry:published", [entry]],
    ["entry:updated", [entry, entry]],
    ["entry:meta_changed", [entry, changes]],
    ["entry:trashed", [entry]],
    ["entry:restored", [entry]],
    ["entry:deleted", [entry]],
  ];

  it.each(ENTRY_EVENTS)(
    "%s enqueues the entry's purge tags",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, purgeTags } = fakeCtx();

      await fire(hooks, event, ...payload, ctx);
      flushPurgeTags(ctx);

      expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:9"]);
    },
  );

  const term = { id: 3, taxonomy: "category" };
  const TERM_EVENTS: readonly (readonly [string, readonly unknown[]])[] = [
    ["term:created", [term]],
    ["term:updated", [term, term]],
    ["term:meta_changed", [term, changes]],
    ["term:deleted", [term]],
  ];

  it.each(TERM_EVENTS)(
    "%s enqueues purge tags for the taxonomy's entry types",
    async (event, payload) => {
      const hooks = new HookRegistry();
      registerCorePurgeInvalidator(hooks);
      const { ctx, purgeTags } = fakeCtx();

      await fire(hooks, event, ...payload, ctx);
      flushPurgeTags(ctx);

      expect(purgeTags).toHaveBeenCalledWith(["t:post"]);
    },
  );

  it("batches a bulk publish into one purge call", async () => {
    const hooks = new HookRegistry();
    registerCorePurgeInvalidator(hooks);
    const { ctx, purgeTags } = fakeCtx();

    await fire(hooks, "entry:published", { id: 1, type: "post" }, ctx);
    await fire(hooks, "entry:published", { id: 2, type: "post" }, ctx);
    flushPurgeTags(ctx);

    expect(purgeTags).toHaveBeenCalledTimes(1);
    expect(purgeTags).toHaveBeenCalledWith(["t:post", "e:1", "e:2"]);
  });
});
