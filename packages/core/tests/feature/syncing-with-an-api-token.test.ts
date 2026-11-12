import { describe, test } from "vitest";

import type { SyncRoute } from "../support/sync-routes.js";
import { testSite } from "../../src/test/site.js";
import { SYNC_ROUTES } from "../support/sync-routes.js";

const site = await testSite({ plugins: [] });

function callSync(route: SyncRoute, secret: string) {
  return site.visit(route.path, {
    method: route.method,
    headers: { authorization: `Bearer ${secret}` },
    ...(route.method === "POST" && { body: "{}" }),
  });
}

describe.each(SYNC_ROUTES)("$method $path", (route) => {
  test("refuses an admin token narrowed to settings:manage", async () => {
    const admin = await site.factory.admin.create();
    const { secret } = await site.factory.apiToken.create({
      userId: admin.id,
      scopes: ["settings:manage"],
    });

    const page = await callSync(route, secret);

    page.assertStatus(403).assertJson({ reason: "unscoped_token_required" });
  });

  test("refuses an admin token minted with the draft_only preset", async () => {
    const { secret } = await site
      .actingAs("admin")
      .rpc.auth.apiTokens.create({ name: "operator", preset: "draft_only" });

    const page = await callSync(route, secret);

    page.assertStatus(403).assertJson({ reason: "unscoped_token_required" });
  });
});
