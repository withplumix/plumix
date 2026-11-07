import { describe, expect, test } from "vitest";

import { eq } from "../../src/db/index.js";
import { settings } from "../../src/db/schema/settings.js";
import { definePlugin } from "../../src/plugin/define.js";
import { number, text } from "../../src/plugin/fields/index.js";
import { settingsRpc } from "../../src/rpc/filters.js";
import { loadSettingsGroups } from "../../src/seo/site-settings.js";
import { testSite } from "../../src/test/site.js";

/** The values each `settings.get` output filter run was handed. */
const filtered: unknown[] = [];

const blogSettings = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerSettingsGroup("blog", {
      label: "Blog",
      fields: [
        text("tagline").default("Hello"),
        number("perPage").default(10),
        text("footer"),
      ],
    });
    ctx.filters.add(settingsRpc.get.output, (copy) => {
      filtered.push(copy.values);
      return copy;
    });
  },
});

const site = await testSite({ plugins: [blogSettings] });

/** Saves from the group as it stands, the way a settings card does. */
async function saveCurrent(values: Record<string, unknown>) {
  const admin = site.actingAs("admin");
  const { etag } = await admin.rpc.settings.get({ group: "blog" });
  const saved = await admin.rpc.settings.upsert({
    group: "blog",
    values,
    ifMatch: etag,
  });
  return saved.values;
}

async function readBlog() {
  const { values } = await site
    .actingAs("admin")
    .rpc.settings.get({ group: "blog" });
  return values;
}

async function storedRows() {
  const rows = await site.context.db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.group, "blog"));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

// A group counts as created on its first save: before it, reads use its fields'
// starting values; after it, storage alone. The marker row holds its token.
describe("a settings group created on its first save", () => {
  test("reads its fields' starting values before it is ever saved", async () => {
    expect(await readBlog()).toEqual({ tagline: "Hello", perPage: 10 });
  });

  test("writes every field on the first save, filling unsent keys with their starting values", async () => {
    const values = await saveCurrent({ tagline: "Mine" });

    expect(values).toEqual({ tagline: "Mine", perPage: 10 });
    expect(await storedRows()).toEqual({
      tagline: "Mine",
      perPage: 10,
      __plumix_created: 1,
    });
  });

  test("keeps a setting cleared in the first save cleared", async () => {
    await saveCurrent({ perPage: null });

    expect(await storedRows()).toEqual({
      tagline: "Hello",
      __plumix_created: 1,
    });
    expect(await readBlog()).toEqual({ tagline: "Hello" });
  });

  test("keeps a setting cleared after the first save cleared", async () => {
    await saveCurrent({});

    await saveCurrent({ perPage: null });

    expect(await readBlog()).toEqual({ tagline: "Hello" });
  });

  test("never shows its marker to settings.get or its output filter", async () => {
    await saveCurrent({});
    filtered.length = 0;

    const values = await readBlog();

    expect(values).not.toHaveProperty("__plumix_created");
    expect(filtered).toEqual([{ tagline: "Hello", perPage: 10 }]);
  });

  test("never shows its marker to the server-side settings read", async () => {
    await saveCurrent({});

    const groups = await loadSettingsGroups(site.context, ["blog"]);

    expect(groups.blog).toEqual({ tagline: "Hello", perPage: 10 });
  });

  // The group comes into existence on its first save; only the settings form
  // pre-fills its starting values before then.
  test("answers nothing to the server-side read before it is ever saved", async () => {
    const groups = await loadSettingsGroups(site.context, ["blog"]);

    expect(groups.blog).toBeUndefined();
  });

  test("answers storage alone to the server-side read once created", async () => {
    await saveCurrent({});
    await saveCurrent({ tagline: null, perPage: null });

    const groups = await loadSettingsGroups(site.context, ["blog"]);

    expect(groups.blog).toEqual({});
  });

  // Only the marker makes a group created, so rows written without one still
  // read starting values under what is stored until the first save.
  test("with rows but no marker is not created until its first save", async () => {
    await site.factory.setting.create({
      group: "blog",
      key: "tagline",
      value: "Legacy",
    });

    expect(await readBlog()).toEqual({ tagline: "Legacy", perPage: 10 });
    await saveCurrent({ footer: "(c)" });
    expect(await storedRows()).toEqual({
      tagline: "Legacy",
      perPage: 10,
      footer: "(c)",
      __plumix_created: 1,
    });
  });

  test("keeps its marker through a save that clears or overwrites it", async () => {
    await saveCurrent({});

    await saveCurrent({ __plumix_created: null, perPage: null });
    expect((await storedRows()).__plumix_created).toBe(2);

    await saveCurrent({ __plumix_created: "x" });
    expect((await storedRows()).__plumix_created).toBe(3);
  });

  // The marker is what keeps a group created once every setting in it has
  // been cleared.
  test("stays created once every setting in it was cleared", async () => {
    await saveCurrent({});

    await saveCurrent({ tagline: null, perPage: null });

    expect(await readBlog()).toEqual({});
  });
});
