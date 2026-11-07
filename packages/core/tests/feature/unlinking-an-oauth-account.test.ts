import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("unlinking an OAuth account", () => {
  test("answers NOT_FOUND naming a provider the caller has no link to", async () => {
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    await site.factory.oauthAccount.create({
      userId: other.id,
      provider: "github",
    });

    const unlinking = site
      .actingAs("editor")
      .rpc.auth.oauthAccounts.unlink({ provider: "github" });

    await expect(unlinking).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "oauth_account", id: "github" },
    });
  });
});
