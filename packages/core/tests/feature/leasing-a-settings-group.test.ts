import { describe, expect, test } from "vitest";

import { readEditLease } from "../../src/db/edit-lease.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("leasing a settings group", () => {
  test("leases the group to the caller from the admin for 120 seconds", async () => {
    const admin = await site.factory.admin.create();

    const lease = await site
      .actingAs(admin)
      .rpc.settings.lease.acquire({ group: "general" });

    expect(lease).toMatchObject({
      holder: { id: admin.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another admin holds it, the caller is refused with who and since when", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    await site.actingAs(ada).rpc.settings.lease.acquire({ group: "general" });

    await expect(
      site.actingAs("admin").rpc.settings.lease.acquire({ group: "general" }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-10-19T12:00:00Z"),
      },
    });
  });

  test("with takeOver, the caller replaces the admin holding it", async () => {
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = await site.factory.admin.create();
    await site.actingAs(ada).rpc.settings.lease.acquire({ group: "general" });

    const lease = await site
      .actingAs(admin)
      .rpc.settings.lease.acquire({ group: "general", takeOver: true });

    expect(lease.holder.id).toBe(admin.id);
  });

  test("by a caller who can't manage settings is forbidden", async () => {
    await expect(
      site.actingAs("editor").rpc.settings.lease.acquire({ group: "general" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });
});

describe("renewing a settings group lease", () => {
  test("after another admin took over, the renewal reports who and when", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = site.actingAs("admin");
    await admin.rpc.settings.lease.acquire({ group: "general" });
    site.travel({ minutes: 1 });
    await site
      .actingAs(ada)
      .rpc.settings.lease.acquire({ group: "general", takeOver: true });

    const renewal = await admin.rpc.settings.lease.renew({ group: "general" });

    expect(renewal).toEqual({
      lost: {
        by: { id: ada.id, name: "Ada" },
        at: new Date("2026-10-19T12:01:00Z"),
      },
    });
  });
});

describe("releasing a settings group lease", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const admin = site.actingAs("admin");
    await admin.rpc.settings.lease.acquire({ group: "general" });

    await admin.rpc.settings.lease.release({ group: "general" });

    expect(
      await readEditLease(
        site.context.db,
        { kind: "settings_group", id: "general" },
        new Date("2026-10-19T12:00:30Z"),
      ),
    ).toBeUndefined();
  });
});
