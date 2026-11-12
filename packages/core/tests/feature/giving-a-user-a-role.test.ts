import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({
  plugins: [],
  config: {
    roles: {
      designer: { can: { admin: ["access"], user: ["list"] } },
      // Holds `user:promote` but not everything an editor does.
      promoter: {
        extends: "member",
        can: {
          admin: ["access"],
          user: ["list", "create", "edit", "promote"],
        },
      },
    },
  },
});

describe("a role the site declares in config", () => {
  test("an invite can hold it", async () => {
    const { user: invited } = await site
      .actingAs("admin")
      .rpc.user.invite({ email: "designer@example.test", role: "designer" });

    expect(invited.role).toBe("designer");
  });

  test("a user given it holds its capabilities", async () => {
    const target = await site.factory.member.create();
    await site.actingAs("admin").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      role: "designer",
    });

    const listed = await site.actingAs(target).rpc.user.list({});

    expect(listed).not.toHaveLength(0);
  });

  test("a role the config doesn't declare is refused", async () => {
    const invite = site
      .actingAs("admin")
      .rpc.user.invite({ email: "ghost@example.test", role: "ghost" });

    await expect(invite).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("a stored role the config no longer declares", () => {
  test("grants no capabilities", async () => {
    const ghost = await site.factory.user.create({ role: "ghost" });
    const acting = site.actingAs(ghost);

    const session = await acting.rpc.auth.session();

    expect(session.user).toMatchObject({ role: "ghost", capabilities: [] });
    await expect(
      acting.rpc.user.update({
        id: ghost.id,
        ifMatch: etagOf(ghost.updatedAt),
        name: "Renamed",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit_own" },
    });
  });
});

describe("assigning a role, whose capabilities the actor must hold", () => {
  test("a role with a capability the actor lacks is refused", async () => {
    const target = await site.factory.member.create();

    const update = site.actingAs("promoter").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      role: "editor",
    });

    await expect(update).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await site.context.db.query.users.findFirst({
        where: eq(users.id, target.id),
      }),
    ).toMatchObject({ role: "member" });
  });

  test("a role within the actor's capabilities is assigned", async () => {
    const target = await site.factory.member.create();

    const updated = await site.actingAs("promoter").rpc.user.update({
      id: target.id,
      ifMatch: etagOf(target.updatedAt),
      role: "designer",
    });

    expect(updated.role).toBe("designer");
  });

  test("an invite for a role with a capability the actor lacks is refused", async () => {
    const invite = site
      .actingAs("promoter")
      .rpc.user.invite({ email: "boss@example.test", role: "admin" });

    await expect(invite).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
