import type { PluginRegistry } from "plumix/plugin";
import {
  createPluginRegistry,
  definePlugin,
  HookRegistry,
  installPlugins,
  registerCoreLookupAdapters,
} from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { getEligibleMenuKinds } from "./eligibility.js";

async function buildRegistry(
  plugins: ReturnType<typeof definePlugin>[],
): Promise<PluginRegistry> {
  const hooks = new HookRegistry();
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  await installPlugins({ hooks, plugins, registry });
  return registry;
}

describe("getEligibleMenuKinds", () => {
  test("an empty registry surfaces only the Custom URL tab", async () => {
    const registry = await buildRegistry([]);
    const tabs = getEligibleMenuKinds(registry);
    expect(tabs).toEqual([{ kind: "custom", tabLabel: "Custom URL" }]);
  });

  test.each([
    {
      name: "isPublic: true, no override",
      register: { isPublic: true },
      eligible: true,
    },
    {
      name: "isPublic: true, isShownInMenus: false",
      register: { isPublic: true, isShownInMenus: false },
      eligible: false,
    },
    {
      name: "isPublic: false, no override",
      register: { isPublic: false },
      eligible: false,
    },
    {
      name: "isPublic: false, isShownInMenus: true (override)",
      register: { isPublic: false, isShownInMenus: true },
      eligible: true,
    },
    {
      name: "isPublic unset, no override (default true)",
      register: {},
      eligible: true,
    },
  ])("entry type cascade — $name", async ({ register, eligible }) => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", ...register });
      }),
    ]);
    const tabs = getEligibleMenuKinds(registry);
    const hasEntryTab = tabs.some(
      (t) => t.kind === "entry" && t.target === "post",
    );
    expect(hasEntryTab).toBe(eligible);
  });

  test.each([
    {
      name: "isPublic: true, no override",
      register: { isPublic: true },
      eligible: true,
    },
    {
      name: "isPublic: true, isShownInMenus: false",
      register: { isPublic: true, isShownInMenus: false },
      eligible: false,
    },
    {
      name: "isPublic: false, isShownInMenus: true",
      register: { isPublic: false, isShownInMenus: true },
      eligible: true,
    },
    {
      name: "isPublic: false default",
      register: { isPublic: false },
      eligible: false,
    },
  ])("term taxonomy cascade — $name", async ({ register, eligible }) => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerTermTaxonomy("category", {
          label: "Categories",
          ...register,
        });
      }),
    ]);
    const tabs = getEligibleMenuKinds(registry);
    const hasTermTab = tabs.some(
      (t) => t.kind === "term" && t.target === "category",
    );
    expect(hasTermTab).toBe(eligible);
  });

  test("menuPickerLabel overrides the default tab label for entry types", async () => {
    const registry = await buildRegistry([
      definePlugin("shop", (ctx) => {
        ctx.registerEntryType("product", {
          label: "Products",
          labels: { plural: "Products" },
          isPublic: true,
          menuPickerLabel: "Catalog",
        });
      }),
    ]);
    const tabs = getEligibleMenuKinds(registry);
    expect(tabs.find((t) => t.kind === "entry")?.tabLabel).toBe("Catalog");
  });

  test("falls back to labels.plural, then label, when menuPickerLabel is unset", async () => {
    const registry = await buildRegistry([
      definePlugin("a", (ctx) => {
        ctx.registerEntryType("a-type", {
          label: "A label",
          labels: { plural: "A plurals" },
          isPublic: true,
        });
        ctx.registerEntryType("b-type", {
          label: "B label",
          isPublic: true,
        });
      }),
    ]);
    const tabs = getEligibleMenuKinds(registry);
    const a = tabs.find((t) => t.target === "a-type");
    const b = tabs.find((t) => t.target === "b-type");
    expect(a?.tabLabel).toBe("A plurals");
    expect(b?.tabLabel).toBe("B label");
  });

  test("built-in entry / term lookup adapters do not surface as their own tabs", async () => {
    const registry = await buildRegistry([]);
    const tabs = getEligibleMenuKinds(registry);
    // `entry` and `term` lookup adapters are seeded by
    // `registerCoreLookupAdapters` but should NOT appear as picker
    // kinds — they're per-target via entry types / taxonomies.
    expect(tabs.find((t) => t.kind === "entry")).toBeUndefined();
    expect(tabs.find((t) => t.kind === "term")).toBeUndefined();
  });

  test("non-default lookup adapters need menuPicker to opt in", async () => {
    const stubAdapter = {
      list: () => Promise.resolve([]),
      resolve: () => Promise.resolve(null),
    };
    const offRegistry = await buildRegistry([
      definePlugin("media-off", (ctx) => {
        ctx.registerLookupAdapter({
          kind: "media-off",
          adapter: stubAdapter,
          capability: null,
        });
      }),
    ]);
    expect(
      getEligibleMenuKinds(offRegistry).find((t) => t.kind === "media-off"),
    ).toBeUndefined();

    const onRegistry = await buildRegistry([
      definePlugin("media-on", (ctx) => {
        ctx.registerLookupAdapter({
          kind: "media-on",
          adapter: stubAdapter,
          capability: null,
          menuPicker: { tabLabel: "Media files" },
        });
      }),
    ]);
    const onTabs = getEligibleMenuKinds(onRegistry);
    expect(onTabs.find((t) => t.kind === "media-on")?.tabLabel).toBe(
      "Media files",
    );
  });

  test("Custom URL is always the last tab", async () => {
    const registry = await buildRegistry([
      definePlugin("blog", (ctx) => {
        ctx.registerEntryType("post", { label: "Posts", isPublic: true });
        ctx.registerTermTaxonomy("tag", { label: "Tags", isPublic: true });
      }),
    ]);
    const tabs = getEligibleMenuKinds(registry);
    expect(tabs[tabs.length - 1]?.kind).toBe("custom");
  });
});
