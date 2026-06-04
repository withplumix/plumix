import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { users } from "../../../db/schema/users.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../../test/dispatcher.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("user.setLocale", () => {
  test("persists the requested code to users.meta.locale", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    await h.client.user.setLocale({ code: "en" });

    const row = await h.db.query.users.findFirst({
      where: eq(users.id, h.user.id),
    });
    expect((row?.meta as { locale?: string }).locale).toBe("en");
  });

  test("rejects a code that isn't in the site's enabled locales", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    // Default site has only `en` enabled.

    await expect(h.client.user.setLocale({ code: "de" })).rejects.toThrow();

    const row = await h.db.query.users.findFirst({
      where: eq(users.id, h.user.id),
    });
    expect((row?.meta as { locale?: string }).locale).toBeUndefined();
  });

  test("Set-Cookie is marked Secure when the request is over HTTPS", async () => {
    const h = await createDispatcherHarness({
      i18n: { defaultLocale: "en", locales: ["en", "ar"] },
    });
    const admin = await h.seedUser("admin");
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/user/setLocale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { code: "ar" } }),
      }),
      admin.id,
    );

    const response = await h.dispatch(request);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
  });

  test("attaches Set-Cookie: plumix_locale=<code>; Path=/_plumix/ on success", async () => {
    const h = await createDispatcherHarness({
      i18n: { defaultLocale: "en", locales: ["en", "ar"] },
    });
    const admin = await h.seedUser("admin");
    const request = await h.authenticateRequest(
      plumixRequest("/_plumix/rpc/user/setLocale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { code: "ar" } }),
      }),
      admin.id,
    );

    const response = await h.dispatch(request);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("plumix_locale=ar");
    expect(setCookie).toContain("Path=/_plumix/");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=31536000");
  });
});
