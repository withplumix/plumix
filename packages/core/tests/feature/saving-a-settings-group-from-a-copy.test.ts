import { describe, expect, test } from "vitest";

import { readEditLease } from "../../src/db/edit-lease.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("saving a settings group from a copy", () => {
  test("without ifMatch is refused with where to find the etag", async () => {
    await expect(
      // @ts-expect-error -- the caller left out its copy's token
      site.actingAs("admin").rpc.settings.upsert({
        group: "general",
        values: { tagline: "x" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        issues: [
          {
            message:
              "Send the settings group's `etag` from `settings.get` as `ifMatch`",
          },
        ],
      },
    });
  });

  test("answers a later etag on each save, chained from the last one's", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const admin = site.actingAs("admin");
    const first = await admin.rpc.settings.upsert({
      group: "general",
      values: { tagline: "a" },
      ifMatch: "0",
    });
    const second = await admin.rpc.settings.upsert({
      group: "general",
      values: { tagline: "b" },
      ifMatch: first.etag,
    });

    const third = await admin.rpc.settings.upsert({
      group: "general",
      values: {},
      ifMatch: second.etag,
    });

    expect([first.etag, second.etag, third.etag]).toEqual(["1", "2", "3"]);
  });

  test("from a stale copy is refused and writes no key", async () => {
    const admin = site.actingAs("admin");
    await admin.rpc.settings.upsert({
      group: "general",
      values: { tagline: "theirs" },
      ifMatch: "0",
    });

    await expect(
      admin.rpc.settings.upsert({
        group: "general",
        values: { tagline: "mine", site_title: "Mine" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", etag: "1" },
    });
    expect(await admin.rpc.settings.get({ group: "general" })).toEqual({
      etag: "1",
      values: { tagline: "theirs" },
    });
  });

  test("of two first saves racing, one lands and the other conflicts", async () => {
    const admin = site.actingAs("admin");

    const results = await Promise.allSettled([
      admin.rpc.settings.upsert({
        group: "general",
        values: { tagline: "a" },
        ifMatch: "0",
      }),
      admin.rpc.settings.upsert({
        group: "general",
        values: { tagline: "b" },
        ifMatch: "0",
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: {
        code: "CONFLICT",
        data: { reason: "etag_mismatch", etag: "1" },
      },
    });
  });

  test("of a group saved before its marker counted reads as etag 0 and saves from it", async () => {
    await site.factory.setting.create({
      group: "general",
      key: "__plumix_created",
      value: true,
    });
    await site.factory.setting.create({
      group: "general",
      key: "tagline",
      value: "old",
    });
    const admin = site.actingAs("admin");
    const copy = await admin.rpc.settings.get({ group: "general" });

    const saved = await admin.rpc.settings.upsert({
      group: "general",
      values: { tagline: "new" },
      ifMatch: copy.etag,
    });

    expect([copy.etag, saved.etag]).toEqual(["0", "1"]);
    expect(saved.values).toEqual({ tagline: "new" });
  });
});

describe("saving a settings group under an edit lease", () => {
  test("another admin's save while one holds the group's lease is refused with who holds it", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    await site.actingAs(ada).rpc.settings.lease.acquire({ group: "general" });
    const admin = site.actingAs("admin");

    await expect(
      admin.rpc.settings.upsert({
        group: "general",
        values: { tagline: "mine" },
        ifMatch: "0",
      }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: {
        holder: { id: ada.id, name: "Ada" },
        since: new Date("2026-10-19T12:00:00Z"),
      },
    });
    expect((await admin.rpc.settings.get({ group: "general" })).values).toEqual(
      {},
    );
  });

  test("a save that takes over the group's lease lands and holds it", async () => {
    site.freezeTime("2026-10-19T12:00:00Z");
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = await site.factory.admin.create();
    await site.actingAs(ada).rpc.settings.lease.acquire({ group: "general" });

    const saved = await site.actingAs(admin).rpc.settings.upsert({
      group: "general",
      values: { tagline: "mine" },
      ifMatch: "0",
      takeOver: true,
    });

    expect(saved.values).toEqual({ tagline: "mine" });
    expect(
      (
        await readEditLease(
          site.context.db,
          { kind: "settings_group", id: "general" },
          new Date("2026-10-19T12:00:00Z"),
        )
      )?.holder.id,
    ).toBe(admin.id);
  });

  test("a stale save names who holds the group's lease in its conflict", async () => {
    const ada = await site.factory.admin.create({ name: "Ada" });
    const admin = await site.factory.admin.create();
    await site.actingAs(admin).rpc.settings.upsert({
      group: "general",
      values: { tagline: "first" },
      ifMatch: "0",
    });
    await site.actingAs(ada).rpc.settings.lease.acquire({ group: "general" });

    await expect(
      site.actingAs(admin).rpc.settings.upsert({
        group: "general",
        values: { tagline: "mine" },
        ifMatch: "0",
        takeOver: true,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "etag_mismatch", holder: { id: admin.id } },
    });
  });
});
