import { describe, expect, test } from "vitest";

import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { adminUser } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("settings.lease.acquire", () => {
  test("leases the group to the caller from the admin for 120 seconds", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const lease = await h.client.settings.lease.acquire({ group: "general" });

    expect(lease).toMatchObject({
      holder: { id: h.user.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another admin holds it, the caller is refused with who and since when", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "settings_group", id: "general" },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.settings.lease.acquire({ group: "general" }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("with takeOver, the caller replaces the admin holding it", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    await acquireEditLease(
      h.db,
      { kind: "settings_group", id: "general" },
      { userId: ada.id, surface: "admin" },
    );

    const lease = await h.client.settings.lease.acquire({
      group: "general",
      takeOver: true,
    });

    expect(lease.holder.id).toBe(h.user.id);
  });

  test("a caller who can't manage settings can't lease a group", async () => {
    const h = await createRpcHarness({ authAs: "editor" });

    await expect(
      h.client.settings.lease.acquire({ group: "general" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });
});

describe("settings.lease.renew", () => {
  test("after another admin took over, the renewal reports who and when", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const ada = await adminUser.transient({ db: h.db }).create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    await h.client.settings.lease.acquire({ group: "general" });
    const takenOver = await asAda.client.settings.lease.acquire({
      group: "general",
      takeOver: true,
    });

    const renewal = await h.client.settings.lease.renew({ group: "general" });

    expect(renewal).toEqual({
      lost: { by: { id: ada.id, name: "Ada" }, at: takenOver.since },
    });
  });
});

describe("settings.lease.release", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.settings.lease.acquire({ group: "general" });

    await h.client.settings.lease.release({ group: "general" });

    expect(
      await readEditLease(
        h.db,
        { kind: "settings_group", id: "general" },
        new Date(Date.now() + 30_000),
      ),
    ).toBeUndefined();
  });
});
