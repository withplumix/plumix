import { describe, expect, test } from "vitest";

import type { Entry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import { requestStore } from "../context/stores.js";
import { createRpcHarness } from "../test/rpc.js";
import { registerCoreSitemapInvalidator } from "./register-sitemap-invalidator.js";
import { readSitemapVersion } from "./sitemap-cache.js";

const ENTRY_EVENTS = [
  "entry:published",
  "entry:updated",
  "entry:trashed",
  "entry:restored",
  "entry:deleted",
] as const;

const TERM_EVENTS = [
  "term:created",
  "term:updated",
  "term:deleted",
  "term:meta_changed",
] as const;

describe("registerCoreSitemapInvalidator", () => {
  // Subscribers ignore the payload (a bump retires every key regardless), so a
  // stub entity stands in for the real lifecycle argument.
  const entry = { id: 1, type: "post" } as unknown as Entry;
  const term = { id: 1, taxonomy: "category" } as unknown as Term;

  test.each(ENTRY_EVENTS)("%s bumps the sitemap version", async (event) => {
    const h = await createRpcHarness();
    registerCoreSitemapInvalidator(h.hooks);

    await requestStore.run(h.context, () =>
      h.hooks.doAction(event as never, entry as never, entry as never),
    );

    expect(await readSitemapVersion(h.context)).toBe(1);
  });

  test.each(TERM_EVENTS)("%s bumps the sitemap version", async (event) => {
    const h = await createRpcHarness();
    registerCoreSitemapInvalidator(h.hooks);

    await requestStore.run(h.context, () =>
      h.hooks.doAction(
        event as never,
        term as never,
        { set: {}, removed: [] } as never,
      ),
    );

    expect(await readSitemapVersion(h.context)).toBe(1);
  });

  test("settings:group_changed bumps only for the site group", async () => {
    const h = await createRpcHarness();
    registerCoreSitemapInvalidator(h.hooks);

    await requestStore.run(h.context, async () => {
      // An unrelated group must not retire the sitemap cache.
      await h.hooks.doAction("settings:group_changed", {
        group: "mail",
        set: { from: "x@y.z" },
        removed: [],
      });
      expect(await readSitemapVersion(h.context)).toBe(0);

      await h.hooks.doAction("settings:group_changed", {
        group: "site",
        set: { public: false },
        removed: [],
      });
      expect(await readSitemapVersion(h.context)).toBe(1);
    });
  });

  test("a fired action outside a request context is a no-op (no throw)", async () => {
    const h = await createRpcHarness();
    registerCoreSitemapInvalidator(h.hooks);

    await h.hooks.doAction("entry:published", entry);

    expect(await readSitemapVersion(h.context)).toBe(0);
  });
});
