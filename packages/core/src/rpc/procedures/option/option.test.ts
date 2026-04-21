import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { options } from "../../../db/schema/options.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("option.set", () => {
  test("admin can insert a new option; autoload defaults to true", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const row = await h.client.option.set({
      name: "site_title",
      value: "Hello",
    });
    expect(row.name).toBe("site_title");
    expect(row.value).toBe("Hello");
    expect(row.isAutoloaded).toBe(true);
  });

  test("setting an existing option is an upsert (no CONFLICT)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "brand", value: "v1" });
    const updated = await h.client.option.set({
      name: "brand",
      value: "v2",
    });
    expect(updated.value).toBe("v2");

    const rows = await h.context.db
      .select()
      .from(options)
      .where(eq(options.name, "brand"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("v2");
  });

  test("isAutoloaded can be explicitly disabled", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const row = await h.client.option.set({
      name: "secret",
      value: "x",
      isAutoloaded: false,
    });
    expect(row.isAutoloaded).toBe(false);
  });

  test("editor cannot set options (admin-only gate)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.option.set({ name: "whatever", value: "nope" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "option:manage" },
    });
  });

  test("rejects option names with disallowed characters", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    // leading space is rejected by the regex after v.trim() strips it; the
    // input validator surfaces a ORPC-level input error, not a FORBIDDEN.
    await expect(
      h.client.option.set({ name: "bad name!", value: "x" }),
    ).rejects.toThrow();
  });
});

describe("option.get", () => {
  test("admin can read an option", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "k", value: "v" });
    const got = await h.client.option.get({ name: "k" });
    expect(got.value).toBe("v");
  });

  test("NOT_FOUND for a missing option", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.option.get({ name: "missing" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "option", id: "missing" },
    });
  });

  test("editor cannot read options (reads gated by option:manage too)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(h.client.option.get({ name: "k" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "option:manage" },
    });
  });
});

describe("option.getMany", () => {
  test("admin fetches a keyed map for existing names; missing names omitted", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "general.site_title", value: "Plumix" });
    await h.client.option.set({
      name: "general.site_description",
      value: "Headless CMS",
    });
    const map = await h.client.option.getMany({
      names: [
        "general.site_title",
        "general.site_description",
        "general.admin_email",
      ],
    });
    expect(map).toEqual({
      "general.site_title": "Plumix",
      "general.site_description": "Headless CMS",
    });
  });

  test("returns an empty object when no names match", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const map = await h.client.option.getMany({ names: ["nope.one"] });
    expect(map).toEqual({});
  });

  test("editor cannot use getMany (reads gated by option:manage)", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(
      h.client.option.getMany({ names: ["anything"] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "option:manage" },
    });
  });

  test("rejects empty names array at the schema layer", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(h.client.option.getMany({ names: [] })).rejects.toThrow();
  });
});

describe("option.list", () => {
  test("admin lists all options by default, sorted by name", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "zebra", value: "1" });
    await h.client.option.set({ name: "alpha", value: "2" });
    const rows = await h.client.option.list({});
    expect(rows.map((r) => r.name)).toEqual(["alpha", "zebra"]);
  });

  test("autoloadedOnly narrows to rows with isAutoloaded=true", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({
      name: "auto_yes",
      value: "a",
      isAutoloaded: true,
    });
    await h.client.option.set({
      name: "auto_no",
      value: "b",
      isAutoloaded: false,
    });
    const rows = await h.client.option.list({ autoloadedOnly: true });
    expect(rows.map((r) => r.name)).toEqual(["auto_yes"]);
  });

  test("prefix filters by leading substring", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "mail_smtp_host", value: "x" });
    await h.client.option.set({ name: "mail_smtp_port", value: "y" });
    await h.client.option.set({ name: "other", value: "z" });
    const rows = await h.client.option.list({ prefix: "mail_" });
    expect(rows.map((r) => r.name).sort()).toEqual([
      "mail_smtp_host",
      "mail_smtp_port",
    ]);
  });
});

describe("option.delete", () => {
  test("admin can delete an option", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await h.client.option.set({ name: "gone", value: "x" });
    const deleted = await h.client.option.delete({ name: "gone" });
    expect(deleted.name).toBe("gone");

    await expect(h.client.option.get({ name: "gone" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("NOT_FOUND when the option does not exist", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.option.delete({ name: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("editor cannot delete options", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    await expect(h.client.option.delete({ name: "x" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "option:manage" },
    });
  });
});
