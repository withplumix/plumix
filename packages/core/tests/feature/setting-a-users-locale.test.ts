import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({
  plugins: [],
  config: { i18n: { defaultLocale: "en", locales: ["en", "ar"] } },
});

async function storedUser(id: number) {
  return site.context.db.query.users.findFirst({ where: eq(users.id, id) });
}

describe("setting a user's locale", () => {
  test("stores the code in the user's meta", async () => {
    const admin = await site.factory.admin.create();

    await site.actingAs(admin).rpc.user.setLocale({ code: "en" });

    expect((await storedUser(admin.id))?.meta).toEqual({ locale: "en" });
  });

  // An ordinary write: an admin with the profile open conflicts rather than
  // silently reverting the language.
  test("moves the token, so a profile save from before it conflicts", async () => {
    // Ahead of the clock, so only a token moved past its own value passes.
    const admin = await site.factory.admin.create({
      meta: { pronouns: "they/them" },
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });
    const acting = site.actingAs(admin);
    const opened = await acting.rpc.user.get({ id: admin.id });
    await acting.rpc.user.setLocale({ code: "en" });

    const update = acting.rpc.user.update({
      id: admin.id,
      name: "From the open profile",
      ifMatch: opened.etag,
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "4102444801" },
    });
    expect(await storedUser(admin.id)).toMatchObject({
      meta: { pronouns: "they/them", locale: "en" },
    });
    expect(opened.etag).toBe("4102444800");
  });

  test("a code the site doesn't enable is refused and nothing is stored", async () => {
    const admin = await site.factory.admin.create();

    const setLocale = site.actingAs(admin).rpc.user.setLocale({ code: "de" });

    await expect(setLocale).rejects.toThrow();
    expect((await storedUser(admin.id))?.meta).toEqual({});
  });

  test("sets plumix_locale for the admin's paths, for a year", async () => {
    const page = await site
      .actingAs("admin")
      .visit("/_plumix/rpc/user/setLocale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { code: "ar" } }),
      });

    page
      .assertOk()
      .assertHeader(
        "set-cookie",
        "plumix_locale=ar; Path=/_plumix/; Max-Age=31536000; SameSite=Lax; Secure",
      );
  });

  test("marks the locale cookie Secure over HTTPS", async () => {
    const page = await site
      .actingAs("admin")
      .visit("https://cms.example/_plumix/rpc/user/setLocale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { code: "ar" } }),
      });

    page
      .assertOk()
      .assertHeader(
        "set-cookie",
        "plumix_locale=ar; Path=/_plumix/; Max-Age=31536000; SameSite=Lax; Secure",
      );
  });
});
