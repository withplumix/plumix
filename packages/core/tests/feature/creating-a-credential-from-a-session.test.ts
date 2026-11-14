import { traverseContractProcedures } from "@orpc/server";
import { describe, expect, test } from "vitest";

import type { CoreProcedureMeta } from "../../src/rpc/base.js";
import { appRouter } from "../../src/rpc/router.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

const credentialProcedures: string[] = [];
traverseContractProcedures({ router: appRouter, path: [] }, (procedure) => {
  const meta = procedure.contract["~orpc"].meta as CoreProcedureMeta;
  if (meta.createsCredential)
    credentialProcedures.push(procedure.path.join("/"));
});

function callWithToken(secret: string, procedure: string) {
  return site.visit(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: {} }),
  });
}

describe("a procedure that creates a credential", () => {
  test("covers each procedure known to create one", () => {
    expect(credentialProcedures).toEqual(
      expect.arrayContaining([
        "auth/apiTokens/create",
        "auth/deviceFlow/approve",
        "auth/oauthConsent/approve",
        "user/requestEmailChange",
        "user/invite",
      ]),
    );
  });

  // An admin's unscoped token holds every capability, so only the kind of
  // credential can refuse it.
  test.each(credentialProcedures)("%s refuses an API token", async (path) => {
    const admin = await site.factory.admin.create();
    const { secret } = await site.factory.apiToken.create({ userId: admin.id });

    const page = await callWithToken(secret, path);

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
  });

  test("leaves the same token working elsewhere", async () => {
    const admin = await site.factory.admin.create();
    const { secret } = await site.factory.apiToken.create({ userId: admin.id });

    const page = await callWithToken(secret, "auth/apiTokens/list");

    page.assertOk();
  });
});
