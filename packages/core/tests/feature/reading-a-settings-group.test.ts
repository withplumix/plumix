import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("reading a settings group", () => {
  test("an empty group reads as an empty bag", async () => {
    const { values } = await site
      .actingAs("admin")
      .rpc.settings.get({ group: "general" });

    expect(values).toEqual({});
  });

  test("answers the keys saved in it", async () => {
    await site.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "Example",
    });
    await site.factory.setting.create({
      group: "general",
      key: "tagline",
      value: "A site",
    });

    const { values } = await site
      .actingAs("admin")
      .rpc.settings.get({ group: "general" });

    expect(values).toEqual({ site_title: "Example", tagline: "A site" });
  });

  test.each([
    { group: "general", values: { site_title: "G" } },
    { group: "reading", values: { per_page: "10" } },
  ])("answers only the keys of the group it names ($group)", async (row) => {
    await site.factory.setting.create({
      group: "general",
      key: "site_title",
      value: "G",
    });
    await site.factory.setting.create({
      group: "reading",
      key: "per_page",
      value: "10",
    });

    const copy = await site
      .actingAs("admin")
      .rpc.settings.get({ group: row.group });

    expect(copy.values).toEqual(row.values);
  });

  test("by a caller who can't manage settings is forbidden", async () => {
    await expect(
      site.actingAs("editor").rpc.settings.get({ group: "general" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("a group never saved reads with etag 0", async () => {
    const copy = await site
      .actingAs("admin")
      .rpc.settings.get({ group: "general" });

    expect(copy).toEqual({ etag: "0", values: {} });
  });

  // A group ending in `_internal` is server-only storage, like the visitor-IP
  // salt; hiding it from a settings page never kept it out of the RPC.
  test("a private group is refused", async () => {
    await site.factory.setting.create({
      group: "forms_internal",
      key: "ip_salt",
      value: "8f14e45fceea167a5a36dedd4bea2543",
    });

    await expect(
      site.actingAs("admin").rpc.settings.get({ group: "forms_internal" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "settings_group_private" },
    });
  });
});
