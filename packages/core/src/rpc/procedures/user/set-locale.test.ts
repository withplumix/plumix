import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { etagOf } from "../../../db/concurrency.js";
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

  // An ordinary write: an admin with the profile open conflicts rather than
  // silently reverting the language.
  test("moves the token, so a profile save from before it conflicts", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    // Ahead of the clock, so only a token moved past its own value passes.
    await h.db
      .update(users)
      .set({
        meta: { pronouns: "they/them" },
        updatedAt: new Date("2100-01-01T00:00:00Z"),
      })
      .where(eq(users.id, h.user.id));
    const opened = await h.client.user.get({ id: h.user.id });

    await h.client.user.setLocale({ code: "en" });

    await expect(
      h.client.user.update({
        id: h.user.id,
        name: "From the open profile",
        ifMatch: opened.etag,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444801" },
    });
    expect(
      await h.db.query.users.findFirst({ where: eq(users.id, h.user.id) }),
    ).toMatchObject({ meta: { pronouns: "they/them", locale: "en" } });
    expect(opened.etag).toBe(etagOf(new Date("2100-01-01T00:00:00Z")));
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
      config: { i18n: { defaultLocale: "en", locales: ["en", "ar"] } },
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
      config: { i18n: { defaultLocale: "en", locales: ["en", "ar"] } },
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
