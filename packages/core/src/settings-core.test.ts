import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "./plugin/manifest.js";
import { META_FIELD_KEY_RE } from "./plugin/validation/meta-field-key.js";
import { registerCoreSettings } from "./settings-core.js";

describe("registerCoreSettings", () => {
  test("registers a `site` identity group with title + tagline", () => {
    const registry = createPluginRegistry();
    registerCoreSettings(registry);

    const group = registry.settingsGroups.get("site");
    expect(group).toBeDefined();
    expect(group?.registeredBy).toBeNull();
    const keys = group?.fields.map((f) => f.key);
    expect(keys).toContain("title");
    expect(keys).toContain("tagline");
  });

  test("registers a `general` page that surfaces the site group", () => {
    const registry = createPluginRegistry();
    registerCoreSettings(registry);

    const page = registry.settingsPages.get("general");
    expect(page).toBeDefined();
    expect(page?.groups).toContain("site");
  });

  test("social fields are URL inputs so themes render them as links", () => {
    const registry = createPluginRegistry();
    registerCoreSettings(registry);
    const group = registry.settingsGroups.get("site");
    const social = group?.fields.find((f) => f.key === "twitter_url");
    expect(social?.inputType).toBe("url");
  });

  test("every field key is RPC-writable (matches the meta key regex)", () => {
    // registerCoreSettings bypasses assertMetaBoxFields, so a key the upsert
    // regex rejects would be a silently unwritable field.
    const registry = createPluginRegistry();
    registerCoreSettings(registry);
    for (const field of registry.settingsGroups.get("site")?.fields ?? []) {
      expect(META_FIELD_KEY_RE.test(field.key)).toBe(true);
    }
  });
});
