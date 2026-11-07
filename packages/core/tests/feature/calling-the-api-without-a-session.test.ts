import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../src/auth/cookies.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("a call that needs a session", () => {
  test("is refused when no session cookie is present", async () => {
    const listing = site.rpc.entry.list({});

    await expect(listing).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("is refused when the session cookie is a bogus token", async () => {
    const page = await site.visit("/_plumix/rpc/entry/list", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=bogus-token`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ json: {} }),
    });

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
  });

  test("reaches the handler with a valid session", async () => {
    const rows = await site.actingAs("admin").rpc.entry.list({});

    expect(rows).toEqual([]);
  });
});
