import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { resolveLocales } from "../i18n/locale-registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createAppContext, withUser } from "./app.js";

// Production builds the AppContext before authentication runs; `ctx.locale`
// starts off resolved with `user: null`. `withUser` (called from the
// dispatcher + RPC middleware after auth) is the only place where step 1
// of the resolver — `user.meta.locale` — can fire.

describe("withUser — locale re-resolution", () => {
  test("re-resolves ctx.locale once a user is attached so user.meta.locale wins", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "fr"],
    });
    const baseCtx = createAppContext({
      db: {} as never,
      env: {},
      request: new Request("https://cms.example/", {
        headers: { "accept-language": "en" },
      }),
      hooks: new HookRegistry(),
      plugins: createPluginRegistry(),
      i18n,
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
