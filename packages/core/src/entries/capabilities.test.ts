import { describe, expect, expectTypeOf, test } from "vitest";

import {
  entryCapability,
  resolveCapability,
  termCapability,
} from "../auth/contract/capability.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredEntryType } from "../plugin/registry.js";
import { pooledEntryTypeRegistry } from "../test/pooled-entry-types.js";
import {
  entryCapabilityByName,
  namespacedEntryCapability,
} from "./capabilities.js";

describe("namespacedEntryCapability", () => {
  test("spells the capability under the registered type's namespace", () => {
    const news = toRegisteredEntryType(
      "news",
      { label: "News", capabilityType: "post" },
      null,
    );
    expect(namespacedEntryCapability(news, "edit_own")).toBe(
      "entry:post:edit_own",
    );
  });

  test("does not accept a row's type name, which carries no namespace", () => {
    expectTypeOf<string>().not.toExtend<
      Parameters<typeof namespacedEntryCapability>[0]
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

describe("resolveCapability", () => {
  test("resolves an entry reference to the namespace its type pools under", async () => {
    const plugins = await pooledEntryTypeRegistry();
    expect(resolveCapability(plugins, entryCapability("news", "delete"))).toBe(
      "entry:post:delete",
    );
  });

  test("resolves a reference to an unregistered type under its own name", () => {
    const plugins = createPluginRegistry();
    expect(resolveCapability(plugins, entryCapability("ghost", "create"))).toBe(
      "entry:ghost:create",
    );
  });

  test("spells a term reference under its taxonomy, which pools with nothing", () => {
    const plugins = createPluginRegistry();
    expect(resolveCapability(plugins, termCapability("menu", "manage"))).toBe(
      "term:menu:manage",
    );
  });

  test("passes a plain string through untouched", () => {
    const plugins = createPluginRegistry();
    expect(resolveCapability(plugins, "comment:moderate")).toBe(
      "comment:moderate",
    );
  });

  test("a reference is immutable", () => {
    expect(Object.isFrozen(entryCapability("news", "read"))).toBe(true);
    expect(Object.isFrozen(termCapability("tag", "read"))).toBe(true);
  });

  test("types an action to the resource's own actions", () => {
    // @ts-expect-error `manage` is a term action, not an entry one
    entryCapability("news", "manage");
    // @ts-expect-error `publish` is an entry action, not a term one
    termCapability("tag", "publish");
  });
});
