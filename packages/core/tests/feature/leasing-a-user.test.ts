import { describe, expect, test } from "vitest";

import { etagOf } from "../../src/db/concurrency.js";
import { readEditLease } from "../../src/db/edit-lease.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("acquiring a user's lease", () => {
  test("leases the user to the caller from the admin for 120 seconds", async () => {
    const admin = await site.factory.admin.create();
    const target = await site.factory.editor.create();

    const lease = await site
      .actingAs(admin)
      .rpc.user.lease.acquire({ id: target.id });

    expect(lease).toMatchObject({
      holder: { id: admin.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another admin holds it, the caller is refused with who and since when", async () => {
    site.freezeTime("2026-11-07T10:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    const target = await site.factory.editor.create();
    await site.actingAs(ada).rpc.user.lease.acquire({ id: target.id });

    const acquire = site
      .actingAs("admin")
      .rpc.user.lease.acquire({ id: target.id });

    await expect(acquire).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-11-07T10:00:00Z"),
      },
    });
  });

  test("with takeOver, the caller replaces the admin holding it", async () => {
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = await site.factory.admin.create();
    const target = await site.factory.editor.create();
    await site.actingAs(ada).rpc.user.lease.acquire({ id: target.id });

    const lease = await site
      .actingAs(admin)
      .rpc.user.lease.acquire({ id: target.id, takeOver: true });

    expect(lease.holder.id).toBe(admin.id);
  });

  test("a user may lease their own profile", async () => {
    const member = await site.factory.member.create();

    const lease = await site
      .actingAs(member)
      .rpc.user.lease.acquire({ id: member.id });

    expect(lease.holder.id).toBe(member.id);
  });

  test("a caller who can't edit the user can't lease them", async () => {
    const other = await site.factory.editor.create();

    const acquire = site
      .actingAs("member")
      .rpc.user.lease.acquire({ id: other.id });

    await expect(acquire).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "user:edit" },
    });
  });
});

describe("renewing a user's lease", () => {
  test("after another admin took over, the renewal reports who and when", async () => {
    const admin = site.actingAs("admin");
    const ada = await site.factory.admin.create({ name: "Ada" });
    const target = await site.factory.editor.create();
    await admin.rpc.user.lease.acquire({ id: target.id });
    const takenOver = await site
      .actingAs(ada)
      .rpc.user.lease.acquire({ id: target.id, takeOver: true });

    const renewal = await admin.rpc.user.lease.renew({ id: target.id });

    expect(renewal).toEqual({
      lost: { by: { id: ada.id, name: "Ada" }, at: takenOver.since },
    });
  });
});

describe("releasing a user's lease", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    site.freezeTime("2026-11-07T10:00:00Z");
    const admin = site.actingAs("admin");
    const target = await site.factory.editor.create();
    await admin.rpc.user.lease.acquire({ id: target.id });

    await admin.rpc.user.lease.release({ id: target.id });

    expect(
      await readEditLease(
        site.context.db,
        { kind: "user", id: target.id },
        new Date("2026-11-07T10:00:30Z"),
      ),
    ).toBeUndefined();
  });
});

describe("saving a user someone else has leased", () => {
  test("another admin's save during a live lease is refused with who holds it", async () => {
    site.freezeTime("2026-11-07T10:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    const target = await site.factory.editor.create();
    await site.actingAs(ada).rpc.user.lease.acquire({ id: target.id });

    const update = site.actingAs("admin").rpc.user.update({
      id: target.id,
      name: "Mine",
      ifMatch: etagOf(target.updatedAt),
    });

    await expect(update).rejects.toMatchObject({
      code: "LOCKED",
      status: 423,
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-11-07T10:00:00Z"),
      },
    });
  });

  test("a save that passes takeOver lands and takes the lease over", async () => {
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = await site.factory.admin.create();
    const target = await site.factory.editor.create();
    await site.actingAs(ada).rpc.user.lease.acquire({ id: target.id });

    const saved = await site.actingAs(admin).rpc.user.update({
      id: target.id,
      name: "Mine",
      ifMatch: etagOf(target.updatedAt),
      takeOver: true,
    });

    expect(saved.name).toBe("Mine");
    expect(
      await readEditLease(site.context.db, { kind: "user", id: target.id }),
    ).toMatchObject({ holder: { id: admin.id } });
  });

  test("a stale save names who holds the lease in its conflict", async () => {
    const ada = await site.factory.admin.create({ name: "Ada" });
    const asAda = site.actingAs(ada);
    const target = await site.factory.editor.create();
    await asAda.rpc.user.lease.acquire({ id: target.id });

    const update = asAda.rpc.user.update({
      id: target.id,
      name: "From a stale tab",
      ifMatch: etagOf(new Date("2020-01-01T00:00:00Z")),
    });

    await expect(update).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: ada.id, name: "Ada" } },
    });
  });
});
