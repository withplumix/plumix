import { describe, expect, test } from "vitest";

import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("user.lease.acquire", () => {
  test("leases the user to the caller from the admin for 120 seconds", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();

    const lease = await h.client.user.lease.acquire({ id: target.id });

    expect(lease).toMatchObject({
      holder: { id: h.user.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another admin holds it, the caller is refused with who and since when", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const target = await h.factory.editor.create();
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "user", id: target.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.user.lease.acquire({ id: target.id }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("with takeOver, the caller replaces the admin holding it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const target = await h.factory.editor.create();
    await acquireEditLease(
      h.db,
      { kind: "user", id: target.id },
      { userId: ada.id, surface: "admin" },
    );

    const lease = await h.client.user.lease.acquire({
      id: target.id,
      takeOver: true,
    });

    expect(lease.holder.id).toBe(h.user.id);
  });

  test("a user may lease their own profile", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });

    const lease = await h.client.user.lease.acquire({ id: h.user.id });

    expect(lease.holder.id).toBe(h.user.id);
  });

  test("a caller who can't edit the user can't lease them", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const other = await h.factory.editor.create();

    await expect(
      h.client.user.lease.acquire({ id: other.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });
});

describe("user.lease.renew", () => {
  test("after another admin took over, the renewal reports who and when", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await h.factory.admin.create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const target = await h.factory.editor.create();
    await h.client.user.lease.acquire({ id: target.id });
    const takenOver = await asAda.client.user.lease.acquire({
      id: target.id,
      takeOver: true,
    });

    const renewal = await h.client.user.lease.renew({ id: target.id });

    expect(renewal).toEqual({
      lost: { by: { id: ada.id, name: "Ada" }, at: takenOver.since },
    });
  });
});

describe("user.lease.release", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const target = await h.factory.editor.create();
    await h.client.user.lease.acquire({ id: target.id });

    await h.client.user.lease.release({ id: target.id });

    expect(
      await readEditLease(
        h.db,
        { kind: "user", id: target.id },
        new Date(Date.now() + 30_000),
      ),
    ).toBeUndefined();
  });
});
