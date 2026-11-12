import type { AnyRouter } from "@orpc/server";
import { isProcedure } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { eq } from "../../src/db/index.js";
import { users } from "../../src/db/schema/users.js";
import { appRouter } from "../../src/rpc/router.js";
import { fakeMail } from "../../src/test/mail-fake.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Test" } },
    roles: {
      // Manages users without `user:promote`, so an admin holds more.
      usermgr: {
        extends: "member",
        can: { admin: ["access"], user: ["list", "edit", "delete"] },
      },
    },
  },
});

/** The path of every procedure marked as one that changes a user. */
function userModifyingPaths(
  router: AnyRouter,
  path: string[] = [],
): string[][] {
  if (isProcedure(router)) {
    return router["~orpc"].meta.modifiesUser === true ? [path] : [];
  }
  return Object.entries(router).flatMap(([key, child]) =>
    userModifyingPaths(child as AnyRouter, [...path, key]),
  );
}

type Call = (input: object) => Promise<unknown>;

function procedureAt(client: object, path: string[]): Call {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string, unknown>)[key],
    client,
  ) as Call;
}

const PATHS = userModifyingPaths(appRouter);

test("the router marks the procedures that change a user", () => {
  expect(PATHS.map((path) => path.join("."))).toEqual(
    expect.arrayContaining([
      "user.update",
      "user.disable",
      "user.enable",
      "user.delete",
      "user.requestEmailChange",
      "user.cancelEmailChange",
    ]),
  );
});

describe.each(PATHS.map((path) => [path.join("."), path] as const))(
  "%s, on a user who holds a capability the actor lacks",
  (_name, path) => {
    test("is refused and leaves them as they were", async () => {
      await site.factory.admin.create();
      const admin = await site.factory.admin.create({
        disabledAt: new Date(0),
      });
      const call = procedureAt(site.actingAs("usermgr").rpc, path);

      // `v.object` strips the keys a procedure doesn't take.
      const result = call({
        id: admin.id,
        ifMatch: etagOf(admin.updatedAt),
        name: "Renamed",
        newEmail: "new@example.test",
      });

      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        await site.context.db.query.users.findFirst({
          where: eq(users.id, admin.id),
        }),
      ).toEqual(admin);
    });
  },
);

describe("acting on a user who holds nothing the actor lacks", () => {
  test("their email change is requested", async () => {
    const member = await site.factory.member.create();

    const result = await site.actingAs("usermgr").rpc.user.requestEmailChange({
      id: member.id,
      newEmail: "new@example.test",
    });

    expect(result.ok).toBe(true);
  });

  test("they are disabled", async () => {
    const member = await site.factory.member.create();

    const disabled = await site
      .actingAs("usermgr")
      .rpc.user.disable({ id: member.id });

    expect(disabled.disabledAt).not.toBeNull();
  });

  test("they are deleted", async () => {
    const member = await site.factory.member.create();

    await site.actingAs("usermgr").rpc.user.delete({ id: member.id });

    expect(
      await site.context.db.query.users.findFirst({
        where: eq(users.id, member.id),
      }),
    ).toBeUndefined();
  });
});

describe("acting on yourself", () => {
  test("a token scoped to editing its own user renames that user", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      scopes: ["user:edit_own"],
    });

    const page = await site.visit("/_plumix/rpc/user/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        json: { id: editor.id, ifMatch: etagOf(editor.updatedAt), name: "Ed" },
      }),
    });

    page.assertOk();
    expect(
      await site.context.db.query.users.findFirst({
        where: eq(users.id, editor.id),
      }),
    ).toMatchObject({ name: "Ed" });
  });
});
