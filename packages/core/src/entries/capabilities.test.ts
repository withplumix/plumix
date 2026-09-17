import { describe, expect, expectTypeOf, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import { entryCapability, entryCapabilityByName } from "./capabilities.js";

describe("entryCapability", () => {
  test("spells the capability under the registered type's namespace", () => {
    const news = toRegisteredEntryType(
      "news",
      { label: "News", capabilityType: "post" },
      null,
    );
    expect(entryCapability(news, "edit_own")).toBe("entry:post:edit_own");
  });

  test("does not accept a row's type name, which carries no namespace", () => {
    expectTypeOf<string>().not.toExtend<
      Parameters<typeof entryCapability>[0]
    >();
  });
});

describe("entryCapabilityByName", () => {
  test("resolves a pooled type to the namespace it pools under", () => {
    const plugins = createPluginRegistry();
    plugins.entryTypes.set(
      "news",
      toRegisteredEntryType(
        "news",
        { label: "News", capabilityType: "post" },
        null,
      ),
    );
    expect(entryCapabilityByName(plugins, "news", "read")).toBe(
      "entry:post:read",
    );
  });

  test("a name nobody registered is its own namespace", () => {
    const plugins = createPluginRegistry();
    expect(entryCapabilityByName(plugins, "ghost", "read")).toBe(
      "entry:ghost:read",
    );
  });
});
