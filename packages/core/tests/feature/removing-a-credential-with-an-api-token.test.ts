import { traverseContractProcedures } from "@orpc/server";
import { describe, expect, test } from "vitest";

import type { CoreProcedureMeta } from "../../src/rpc/base.js";
import { appRouter } from "../../src/rpc/router.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

/** Every procedure built to revoke or remove a credential, read from the router. */
const removingProcedures: string[] = [];
traverseContractProcedures(
  { router: appRouter, path: [] },
  ({ contract, path }) => {
    const meta = contract["~orpc"].meta as CoreProcedureMeta;
    if (meta.removesCredential) {
      removingProcedures.push(path.join("/"));
    }
  },
);

/** Calls a procedure over the wire, signed in by an admin's unrestricted API token. */
async function callWithAdminToken(procedure: string) {
  const admin = await site.factory.admin.create();
  const { secret } = await site.factory.apiToken.create({
    userId: admin.id,
    name: "unrestricted",
    scopes: null,
  });
  return site.visit(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: {} }),
  });
}

describe("a caller signed in with an unrestricted API token", () => {
  test("finds procedures that remove a credential in the router", () => {
    expect([...removingProcedures].sort()).toEqual([
      "auth/apiTokens/adminRevoke",
      "auth/apiTokens/revoke",
      "auth/credentials/delete",
      "auth/oauthAccounts/unlink",
      "auth/oauthGrants/adminRevoke",
      "auth/oauthGrants/revoke",
      "auth/sessions/revoke",
      "auth/sessions/revokeOthers",
    ]);
  });

  test("still lists its tokens", async () => {
    const page = await callWithAdminToken("auth/apiTokens/list");

    page.assertOk().assertJson({ json: [{ name: "unrestricted" }] });
  });

  test.each(removingProcedures)("is refused calling %s", async (procedure) => {
    const page = await callWithAdminToken(procedure);

    page.assertJson({ json: { code: "UNAUTHORIZED" } });
  });
});
