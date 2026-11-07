import {
  defineFilter,
  definePlugin,
  HandlerRegistry,
  installPlugins,
} from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { feeds } from "./index.js";

describe("feed namespace", () => {
  test("a plugin declaring feed:items again fails boot", async () => {
    const rival = definePlugin("rival", {
      filters: [defineFilter<undefined>("feed:items", { sync: false })],
      setup: () => undefined,
    });

    const install = installPlugins({
      handlers: new HandlerRegistry(),
      plugins: [feeds(), rival],
    });

    await expect(install).rejects.toThrow(
      'Plugin "rival" registers filter "feed:items" already registered by "feeds".',
    );
  });
});
