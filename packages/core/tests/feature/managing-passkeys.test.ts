import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("listing passkeys", () => {
  test("is refused to a visitor", async () => {
    const listing = site.rpc.auth.credentials.list({});

    await expect(listing).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("returns only the caller's own passkeys", async () => {
    const editor = await site.factory.editor.create();
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "MacBook",
    });
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "iPhone",
    });
    await site.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "Other's key",
    });

    const passkeys = await site.actingAs(editor).rpc.auth.credentials.list({});

    expect(passkeys.map((passkey) => passkey.name).sort()).toEqual([
      "MacBook",
      "iPhone",
    ]);
  });

  test("leaves the public key off the wire", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Phone",
    });

    const passkeys = await site.actingAs(editor).rpc.auth.credentials.list({});

    expect(passkeys[0]).not.toHaveProperty("publicKey");
  });
});

describe("renaming a passkey", () => {
  test("renames the caller's own passkey", async () => {
    const editor = await site.factory.editor.create();
    const passkey = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Old name",
    });

    const renamed = await site
      .actingAs(editor)
      .rpc.auth.credentials.rename({ id: passkey.id, name: "New name" });

    expect(renamed.name).toBe("New name");
  });

  test("answers NOT_FOUND for another user's passkey, so it is no oracle", async () => {
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    const theirs = await site.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Not yours",
    });

    const renaming = site
      .actingAs("editor")
      .rpc.auth.credentials.rename({ id: theirs.id, name: "x" });

    await expect(renaming).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test.each([
    ["an empty name", ""],
    ["a name over 64 characters", "x".repeat(65)],
    ["a name with a line break", "name\r\ninjection"],
  ])("refuses %s", async (_case, name) => {
    const editor = await site.factory.editor.create();
    const passkey = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "ok",
    });

    const renaming = site
      .actingAs(editor)
      .rpc.auth.credentials.rename({ id: passkey.id, name });

    await expect(renaming).rejects.toBeDefined();
  });
});

describe("deleting a passkey", () => {
  test("removes it when the caller has more than one", async () => {
    const editor = await site.factory.editor.create();
    const old = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Old",
    });
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "New",
    });
    const caller = site.actingAs(editor);

    const result = await caller.rpc.auth.credentials.delete({ id: old.id });

    expect(result.id).toBe(old.id);
    const left = await caller.rpc.auth.credentials.list({});
    expect(left.map((passkey) => passkey.name)).toEqual(["New"]);
  });

  test("refuses to remove the caller's last passkey", async () => {
    const editor = await site.factory.editor.create();
    const only = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Only",
    });
    const caller = site.actingAs(editor);

    const deleting = caller.rpc.auth.credentials.delete({ id: only.id });

    await expect(deleting).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_credential" },
    });
    await expect(caller.rpc.auth.credentials.list({})).resolves.toHaveLength(1);
  });

  test("answers NOT_FOUND for another user's passkey", async () => {
    const editor = await site.factory.editor.create();
    // The caller has two passkeys, so the at-least-one guard would pass for
    // them; the cross-user attempt must still be NOT_FOUND.
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Mine 1",
    });
    await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "Mine 2",
    });
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    const theirs = await site.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([7, 8, 9]),
      name: "Theirs",
    });

    const deleting = site
      .actingAs(editor)
      .rpc.auth.credentials.delete({ id: theirs.id });

    await expect(deleting).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("of two passkeys at once lets exactly one through, keeping the last", async () => {
    // The count check is folded into the DELETE's WHERE, closing the TOCTOU
    // window; of two concurrent deletes of two passkeys, exactly one may
    // succeed.
    const editor = await site.factory.editor.create();
    const first = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "A",
    });
    const second = await site.factory.credential.create({
      userId: editor.id,
      publicKey: Buffer.from([4, 5, 6]),
      name: "B",
    });
    const caller = site.actingAs(editor);

    const results = await Promise.allSettled([
      caller.rpc.auth.credentials.delete({ id: first.id }),
      caller.rpc.auth.credentials.delete({ id: second.id }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // The losing call is a CONFLICT/last_credential, not NOT_FOUND.
    expect(results.filter((r) => r.status === "rejected")).toMatchObject([
      { reason: { code: "CONFLICT", data: { reason: "last_credential" } } },
    ]);
    await expect(caller.rpc.auth.credentials.list({})).resolves.toHaveLength(1);
  });
});
