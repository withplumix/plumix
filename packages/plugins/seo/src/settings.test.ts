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
    // the new keys instead of turning indexing back on.
    expect(await loadGroup(h)).toEqual({
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

    expect(await loadGroup(h)).toEqual({ indexable: true });
  });

  test("a site with no legacy rows loads an empty bag", async () => {
    const h = await createHarness();

    expect(await loadGroup(h)).toEqual({});
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
