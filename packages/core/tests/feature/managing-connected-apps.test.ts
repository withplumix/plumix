import { beforeEach, describe, expect, test } from "vitest";

import type { User } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";
import {
  approve,
  authorizationParams,
  authorize,
  blog,
  callTool,
  CLIENT_ID,
  connect,
  locationOf,
  pkce,
  refresh,
  serveClientDocument,
  tokenPair,
} from "../support/mcp-client.js";

const site = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});

beforeEach(() => {
  serveClientDocument(site);
});

async function connectedGrant(user: User): Promise<number> {
  const [grant] = await site.actingAs(user).rpc.auth.oauthGrants.list({});
  if (grant === undefined) throw new Error("the user has no connected app");
  return grant.id;
}

describe("a person's connected apps", () => {
  test("lists each client they granted with its name, host, capabilities and last use", async () => {
    site.freezeTime("2026-11-01T10:00:00Z");
    const user = await site.factory.editor.create();
    const token = await connect(site, user, {
      scope: "read",
      capabilities: ["entry:post:read"],
    });
    site.freezeTime("2026-11-01T10:30:00Z");
    await callTool(site, token, "content_list", { type: "post" });

    const grants = await site.actingAs(user).rpc.auth.oauthGrants.list({});

    expect(grants).toMatchObject([
      {
        clientId: CLIENT_ID,
        name: "Example Agent",
        host: "agent.example",
        capabilities: ["entry:post:read"],
        lastUsedAt: new Date("2026-11-01T10:30:00.000Z"),
      },
    ]);
  });

  test("leave out another person's grants", async () => {
    await connect(site, await site.factory.editor.create());
    const bystander = await site.factory.editor.create();

    const grants = await site.actingAs(bystander).rpc.auth.oauthGrants.list({});

    expect(grants).toEqual([]);
  });

  test("name a client by its host until it has exchanged a code", async () => {
    const user = await site.factory.editor.create();
    await approve(site, user, authorizationParams(await pkce()));

    const grants = await site.actingAs(user).rpc.auth.oauthGrants.list({});

    expect(grants).toMatchObject([
      { name: "agent.example", host: "agent.example", lastUsedAt: null },
    ]);
  });
});

describe("revoking a connected app", () => {
  test("refuses its access token at once", async () => {
    const user = await site.factory.editor.create();
    const token = await connect(site, user);
    const id = await connectedGrant(user);

    await site.actingAs(user).rpc.auth.oauthGrants.revoke({ id });

    const call = await callTool(site, token, "content_list", { type: "post" });
    expect(call.status).toBe(401);
  });

  test("answers with the revoked grant", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user);
    const id = await connectedGrant(user);

    const revoked = await site
      .actingAs(user)
      .rpc.auth.oauthGrants.revoke({ id });

    expect(revoked).toEqual({ id });
  });

  test("refuses its refresh token", async () => {
    const user = await site.factory.editor.create();
    const pair = await tokenPair(site, user);
    const id = await connectedGrant(user);

    await site.actingAs(user).rpc.auth.oauthGrants.revoke({ id });

    const refreshed = await refresh(site, pair.refresh_token);
    expect(refreshed).toEqual({
      status: 400,
      body: { error: "invalid_grant" },
    });
  });

  test("sends the client's next authorization to consent", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user);
    const id = await connectedGrant(user);

    await site.actingAs(user).rpc.auth.oauthGrants.revoke({ id });

    const location = locationOf(
      await authorize(site, authorizationParams(await pkce()), user),
    );
    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("drops it from the person's connected apps", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user);
    const id = await connectedGrant(user);

    await site.actingAs(user).rpc.auth.oauthGrants.revoke({ id });

    const grants = await site.actingAs(user).rpc.auth.oauthGrants.list({});
    expect(grants).toEqual([]);
  });

  test("answers NOT_FOUND for another person's grant and leaves their token working", async () => {
    const owner = await site.factory.editor.create();
    const token = await connect(site, owner);
    const id = await connectedGrant(owner);
    const bystander = await site.factory.editor.create();

    const revoking = site.actingAs(bystander).rpc.auth.oauthGrants.revoke({
      id,
    });

    await expect(revoking).rejects.toMatchObject({ status: 404 });
    const call = await callTool(site, token, "content_list", { type: "post" });
    expect(call.status).toBe(200);
  });
});

describe("another person's connected apps", () => {
  test("are listed for an admin", async () => {
    const owner = await site.factory.editor.create();
    await connect(site, owner);
    const admin = await site.factory.admin.create();

    const grants = await site
      .actingAs(admin)
      .rpc.auth.oauthGrants.adminList({ userId: owner.id });

    expect(grants).toMatchObject([
      { clientId: CLIENT_ID, name: "Example Agent" },
    ]);
  });

  test("aren't listed for an editor", async () => {
    const owner = await site.factory.editor.create();
    await connect(site, owner);
    const editor = await site.factory.editor.create();

    const listing = site
      .actingAs(editor)
      .rpc.auth.oauthGrants.adminList({ userId: owner.id });

    await expect(listing).rejects.toMatchObject({ status: 403 });
  });

  test("can be revoked by an admin, which refuses its access token", async () => {
    const owner = await site.factory.editor.create();
    const token = await connect(site, owner);
    const id = await connectedGrant(owner);
    const admin = await site.factory.admin.create();

    await site
      .actingAs(admin)
      .rpc.auth.oauthGrants.adminRevoke({ userId: owner.id, id });

    const call = await callTool(site, token, "content_list", { type: "post" });
    expect(call.status).toBe(401);
  });

  test("can't be revoked by an editor", async () => {
    const owner = await site.factory.editor.create();
    const token = await connect(site, owner);
    const id = await connectedGrant(owner);
    const editor = await site.factory.editor.create();

    const revoking = site
      .actingAs(editor)
      .rpc.auth.oauthGrants.adminRevoke({ userId: owner.id, id });

    await expect(revoking).rejects.toMatchObject({ status: 403 });
    const call = await callTool(site, token, "content_list", { type: "post" });
    expect(call.status).toBe(200);
  });

  test("answer an admin's revoke with the revoked grant", async () => {
    const owner = await site.factory.editor.create();
    await connect(site, owner);
    const id = await connectedGrant(owner);
    const admin = await site.factory.admin.create();

    const revoked = await site
      .actingAs(admin)
      .rpc.auth.oauthGrants.adminRevoke({ userId: owner.id, id });

    expect(revoked).toEqual({ id });
  });

  test("answer NOT_FOUND to an admin's revoke naming another owner", async () => {
    const owner = await site.factory.editor.create();
    const token = await connect(site, owner);
    const id = await connectedGrant(owner);
    const bystander = await site.factory.editor.create();
    const admin = await site.factory.admin.create();

    const revoking = site
      .actingAs(admin)
      .rpc.auth.oauthGrants.adminRevoke({ userId: bystander.id, id });

    await expect(revoking).rejects.toMatchObject({ status: 404 });
    const call = await callTool(site, token, "content_list", { type: "post" });
    expect(call.status).toBe(200);
  });
});
