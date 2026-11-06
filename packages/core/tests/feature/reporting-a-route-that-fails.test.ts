import { describe, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const weather = definePlugin("weather", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/today",
      auth: "public",
      handler: () => {
        throw new Error("the forecast is down");
      },
    });
  },
});

const site = await testSite({ plugins: [weather] });

describe("a route whose handler throws", () => {
  test("logs the failure at error", async () => {
    await site.visit("/_plumix/weather/today");

    site.logger.assertLogged("error", "dispatch_failed");
  });

  test("starts the next test with nothing logged", () => {
    site.logger.assertNothingLogged("error");
  });
});
