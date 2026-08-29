import type { SettingsBag } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import { seo } from "./index.js";

const theme = defineTheme({ templates: [fallback(() => null)] });

function createHarness(): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [seo()], theme });
}

/** The `seo` group as the admin's settings card loads it. */
async function loadGroup(h: DispatcherHarness): Promise<SettingsBag> {
  const admin = await h.seedUser("admin");
  const response = await h.fetch("/_plumix/rpc/settings/get", {
    as: admin,
    json: { json: { group: "seo" }, meta: [] },
  });
  response.assertStatus(200);
  return (await response.json<{ json: SettingsBag }>()).json;
}

describe("the settings the admin form loads", () => {
  test("a legacy site's answers are seeded into the new group", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });
    await h.factory.setting.create({
      group: "site",
      key: "default_og_image",
      value: "https://cms.example/legacy.png",
    });

    // Seeded rather than defaulted, so the next save writes them through under
    // the new keys instead of turning indexing back on. `toMatchObject` because
    // the group also carries the registered defaults of every key the site has
    // no answer for, legacy or otherwise.
    expect(await loadGroup(h)).toMatchObject({
      indexable: false,
      default_og_image: "https://cms.example/legacy.png",
    });
  });

  test("a key already saved under the new group is left alone", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: true,
    });

    expect(await loadGroup(h)).toMatchObject({ indexable: true });
  });

  test("a legacy row of the wrong shape is coerced, not handed on", async () => {
    const h = await createHarness();
    // Nothing in the product writes this, but the column is untyped JSON and
    // the toggle the form binds cannot take a string.
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: "no",
    });

    expect(await loadGroup(h)).toMatchObject({ indexable: true });
  });

  test("a site with no legacy rows is seeded nothing", async () => {
    const h = await createHarness();

    // `default_og_image` registers no default, so its absence is what says the
    // seeding did not run — `indexable` cannot say it, since the value a seed
    // would write here and the registered default are both `true`.
    expect(await loadGroup(h)).not.toHaveProperty("default_og_image");
  });

  test("another group is untouched", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "site",
      key: "public",
      value: false,
    });
    const admin = await h.seedUser("admin");

    const response = await h.fetch("/_plumix/rpc/settings/get", {
      as: admin,
      json: { json: { group: "site" }, meta: [] },
    });
    response.assertStatus(200);

    expect(await response.json<{ json: SettingsBag }>()).toEqual({
      json: { public: false },
    });
  });
});

describe("the settings screen", () => {
  function fieldKeys(h: DispatcherHarness, group: string): readonly string[] {
    return (h.app.plugins.settingsGroups.get(group)?.fields ?? []).map(
      (field) => field.key,
    );
  }

  test("the SEO page carries every group the plugin registers", async () => {
    const h = await createHarness();

    expect(h.app.plugins.settingsPages.get("seo")?.groups).toEqual([
      "seo",
      "seo_verification",
      "seo_robots",
    ]);
  });

  test("a contributor cannot reach any of them", async () => {
    const h = await createHarness();

    for (const group of h.app.plugins.settingsPages.get("seo")?.groups ?? []) {
      expect(h.app.plugins.settingsGroups.get(group)?.capability).toBe(
        "settings:manage",
      );
    }
  });

  test("verification carries one field per engine", async () => {
    const h = await createHarness();

    expect(fieldKeys(h, "seo_verification")).toEqual([
      "google",
      "bing",
      "yandex",
      "baidu",
      "pinterest",
    ]);
  });

  test("robots.txt is editable from its own group", async () => {
    const h = await createHarness();

    expect(fieldKeys(h, "seo_robots")).toEqual(["robots_txt"]);
  });
});
