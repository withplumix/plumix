import { describe, expect, test } from "vitest";

import { withUser } from "../auth/with-user.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { testConfig } from "../test/config.js";
import { createAppContext } from "./app.js";

describe("withUser — locale re-resolution", () => {
  test("re-resolves ctx.locale once a user is attached so user.meta.locale wins", () => {
    const baseCtx = createAppContext({
      db: {} as never,
      env: {},
      request: new Request("https://cms.example/_plumix/admin/"),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      config: testConfig({
        i18n: { defaultLocale: "en", locales: ["en", "fr"] },
      }),
    });
    expect(baseCtx.locale.code).toBe("en");

    const authed = withUser(baseCtx, {
      id: 1,
      email: "u@cms.example",
      role: "admin",
      meta: { locale: "fr" },
    });

    expect(authed.locale.code).toBe("fr");
  });
});
