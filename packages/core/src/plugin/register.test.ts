import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import { DuplicateRegistrationError } from "./manifest.js";
import { installPlugins } from "./register.js";

import "../rpc/hooks.js";

import type { NewEntry } from "../db/schema/entries.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "seo:meta_tags": (tags: { readonly title: string }) => {
      readonly title: string;
    };
  }
}

const examplePost = (overrides: Partial<NewEntry> = {}): NewEntry => ({
  type: "post",
  title: "example",
  slug: "example",
  content: null,
  excerpt: null,
  status: "draft",
  parentId: null,
  menuOrder: 0,
  authorId: 1,
  publishedAt: null,
  ...overrides,
});

describe("installPlugins", () => {
  test("auto-prefixes plugin-registered filters with the plugin id", async () => {
    const hooks = new HookRegistry();
    const seo = definePlugin("seo", (ctx) => {
      ctx.registerFilter("meta_tags", (tags: { readonly title: string }) => ({
        title: `seo:${tags.title}`,
      }));
    });

    const { hooks: result } = await installPlugins({ hooks, plugins: [seo] });
    const out = await result.applyFilter("seo:meta_tags", { title: "hello" });
    expect(out).toEqual({ title: "seo:hello" });
  });

  test("plugins can subscribe to core-owned hooks without prefix", async () => {
    const hooks = new HookRegistry();
    const stamp = definePlugin("stamp", (ctx) => {
      ctx.addFilter("entry:before_save", (post) => ({
        ...post,
        title: `[stamped] ${post.title}`,
      }));
    });

    await installPlugins({ hooks, plugins: [stamp] });
    const out = await hooks.applyFilter(
      "entry:before_save",
      examplePost({ title: "hi" }),
    );
    expect(out.title).toBe("[stamped] hi");
  });

  test("registers post types into the manifest with plugin attribution", async () => {
    const hooks = new HookRegistry();
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("landing_page", {
        label: "Landing Pages",
        isHierarchical: false,
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [blog] });
    const entry = registry.entryTypes.get("landing_page");
    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Landing Pages");
    expect(entry?.registeredBy).toBe("blog");
  });

  test("throws on duplicate post-type registration across plugins", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("a", (ctx) => {
      ctx.registerEntryType("docs", { label: "Docs A" });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerEntryType("docs", { label: "Docs B" });
    });

    await expect(
      installPlugins({ hooks, plugins: [a, b] }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  test("auto-derives the capability set from a post type, using the post type name", async () => {
    const hooks = new HookRegistry();
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("landing_page", { label: "Landing Pages" });
    });

    const { registry } = await installPlugins({ hooks, plugins: [blog] });
    expect(registry.capabilities.get("landing_page:create")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("landing_page:publish")?.minRole).toBe(
      "author",
    );
    expect(registry.capabilities.get("landing_page:edit_any")?.minRole).toBe(
      "editor",
    );
    expect(registry.capabilities.get("landing_page:delete")?.registeredBy).toBe(
      "blog",
    );
  });

  test("capabilityType is the cap namespace — shared types pool their permissions", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("a", (ctx) => {
      ctx.registerEntryType("docs", { label: "Docs", capabilityType: "post" });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerEntryType("guides", {
        label: "Guides",
        capabilityType: "post",
      });
    });
    // Two plugins share `capabilityType: 'post'` — derivation must not throw.
    await expect(
      installPlugins({ hooks, plugins: [a, b] }),
    ).resolves.toBeDefined();
  });

  test("taxonomy registration derives the {name}:{action} cap set", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("geo", (ctx) => {
      ctx.registerTaxonomy("region", { label: "Regions" });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.capabilities.get("region:assign")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("region:manage")?.minRole).toBe("editor");
  });

  test("registerCapability is the escape hatch for plugin-specific caps", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerCapability("seo:manage", "editor");
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.capabilities.get("seo:manage")).toEqual({
      name: "seo:manage",
      minRole: "editor",
      registeredBy: "seo",
    });
  });
});
