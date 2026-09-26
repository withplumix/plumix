import { object } from "valibot";
import { describe, expect, expectTypeOf, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

import { HookRegistry } from "../hooks/registry.js";
import { base } from "../rpc/base.js";
import { registerCoreLookupAdapters } from "../rpc/procedures/lookup-adapters.js";
import { registerCoreSettings } from "../settings-core.js";
import { registerCoreTemplateDeps } from "../template-deps-core.js";
import { createTestContext } from "../test/context.js";
import { createTestDb } from "../test/harness.js";
import { definePlugin } from "./define.js";
import { DuplicateRegistrationError } from "./errors.js";
import { createPluginRegistry } from "./manifest.js";
import { installPlugins } from "./register.js";

import "../rpc/hooks.js";

import type { Lazy } from "@orpc/server";

import type { NewEntry } from "../db/schema/entries.js";
import type { Label } from "../i18n/label.js";
import type { LookupAdapter } from "./lookup.js";
import type { PluginRegistry } from "./manifest.js";
import type { PluginRpcRouter, RegisteredEntryType } from "./registry.js";
import type { PluginSetupContext } from "./setup-context.js";

declare module "../template.js" {
  interface TemplateDepRegistry {
    "dup-thing": { slug: string; result: string };
  }
}

declare module "./image-roles.js" {
  interface ImageRoles {
    "dup-role": true;
  }
}

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
  sortOrder: 0,
  authorId: 1,
  publishedAt: null,
  ...overrides,
});

describe("installPlugins", () => {
  test("records the installed plugin ids on the registry", async () => {
    const hooks = new HookRegistry();
    const { registry } = await installPlugins({
      hooks,
      plugins: [
        definePlugin("alpha", () => {
          // id-only plugin; ordering is what this test asserts
        }),
        definePlugin("beta", () => {
          // id-only plugin
        }),
      ],
    });

    expect(registry.pluginIds).toEqual(["alpha", "beta"]);
  });

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

  test("resolves every visibility flag when a type or taxonomy is registered", async () => {
    const hooks = new HookRegistry();
    const site = definePlugin("site", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryType("menu_item", { label: "Items", isPublic: false });
      ctx.registerEntryType("attachment", {
        label: "Attachments",
        showInSidebar: false,
        excludeFromSearch: true,
      });
      ctx.registerEntryType("form", {
        label: "Forms",
        isPublic: false,
        showUI: true,
      });
      ctx.registerTermTaxonomy("category", { label: "Categories" });
      ctx.registerTermTaxonomy("menu", {
        label: "Menus",
        isPublic: false,
        showUI: true,
      });
      ctx.registerTermTaxonomy("internal", {
        label: "Internal",
        isPublic: false,
        excludeFromSearch: false,
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [site] });
    expect(registry.entryTypes.get("post")).toMatchObject({
      isPublic: true,
      showUI: true,
      showInSidebar: true,
      excludeFromGenericRpc: false,
      excludeFromSearch: false,
    });
    expect(registry.entryTypes.get("menu_item")).toMatchObject({
      isPublic: false,
      showUI: false,
      showInSidebar: false,
      excludeFromGenericRpc: true,
      excludeFromSearch: true,
    });
    expect(registry.entryTypes.get("attachment")).toMatchObject({
      isPublic: true,
      showUI: true,
      showInSidebar: false,
      excludeFromGenericRpc: false,
      excludeFromSearch: true,
    });
    expect(registry.entryTypes.get("form")).toMatchObject({
      isPublic: false,
      showUI: true,
      showInSidebar: true,
      excludeFromGenericRpc: true,
      excludeFromSearch: true,
    });
    expect(registry.termTaxonomies.get("category")).toMatchObject({
      isPublic: true,
      showUI: true,
      showInSidebar: true,
      excludeFromGenericRpc: false,
      excludeFromSearch: false,
    });
    expect(registry.termTaxonomies.get("menu")).toMatchObject({
      isPublic: false,
      showUI: true,
      showInSidebar: true,
      excludeFromGenericRpc: true,
      excludeFromSearch: true,
    });
    expect(registry.termTaxonomies.get("internal")).toMatchObject({
      isPublic: false,
      showUI: false,
      showInSidebar: false,
      excludeFromGenericRpc: true,
      excludeFromSearch: false,
    });
  });

  test("resolves the capability namespace when a type is registered", async () => {
    const hooks = new HookRegistry();
    const site = definePlugin("site", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryType("news", { label: "News", capabilityType: "post" });
    });

    const { registry } = await installPlugins({ hooks, plugins: [site] });
    expect(registry.entryTypes.get("post")?.capabilityType).toBe("post");
    expect(registry.entryTypes.get("news")?.capabilityType).toBe("post");
    expectTypeOf<RegisteredEntryType>()
      .toHaveProperty("capabilityType")
      .toEqualTypeOf<string>();
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
    expect(
      registry.capabilities.get("entry:landing_page:create")?.minRole,
    ).toBe("contributor");
    expect(
      registry.capabilities.get("entry:landing_page:publish")?.minRole,
    ).toBe("author");
    expect(
      registry.capabilities.get("entry:landing_page:edit_any")?.minRole,
    ).toBe("editor");
    expect(
      registry.capabilities.get("entry:landing_page:delete")?.registeredBy,
    ).toBe("blog");
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

  test("capabilityType pooling rejects divergent overrides between plugins", async () => {
    // Both plugins share `capabilityType: "post"` but disagree on the
    // `edit_any` override. Silent first-writer-wins would lock down (or
    // loosen) the pooled cap based on registration order — fail loudly.
    const hooks = new HookRegistry();
    const strict = definePlugin("strict", (ctx) => {
      ctx.registerEntryType("docs", {
        label: "Docs",
        capabilityType: "post",
        capabilities: { edit_any: "admin" },
      });
    });
    const lax = definePlugin("lax", (ctx) => {
      ctx.registerEntryType("guides", {
        label: "Guides",
        capabilityType: "post",
        capabilities: { edit_any: "author" },
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [strict, lax] }),
    ).rejects.toThrow(/minRole "author".*already registered.*minRole "admin"/);
  });

  test("capabilityType pooling accepts matching overrides between plugins", async () => {
    // Same override, two plugins — safe, no throw.
    const hooks = new HookRegistry();
    const a = definePlugin("a", (ctx) => {
      ctx.registerEntryType("docs", {
        label: "Docs",
        capabilityType: "post",
        capabilities: { edit_any: "admin" },
      });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerEntryType("guides", {
        label: "Guides",
        capabilityType: "post",
        capabilities: { edit_any: "admin" },
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [a, b] }),
    ).resolves.toBeDefined();
  });

  test("registerCapability accepts the options-object form with defaultGrants", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerCapability("menu:manage", {
        minRole: "admin",
        defaultGrants: ["editor"],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const cap = registry.capabilities.get("menu:manage");
    expect(cap?.minRole).toBe("admin");
    expect(cap?.defaultGrants).toEqual(["editor"]);
    expect(cap?.registeredBy).toBe("menus");
  });

  test("registerCapability sorts + dedupes defaultGrants deterministically", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerCapability("upload:files", {
        minRole: "admin",
        defaultGrants: ["editor", "author", "editor"],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.capabilities.get("upload:files")?.defaultGrants).toEqual([
      "author",
      "editor",
    ]);
  });

  test("taxonomy registration derives the {name}:{action} cap set", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("geo", (ctx) => {
      ctx.registerTermTaxonomy("region", { label: "Regions" });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.capabilities.get("term:region:assign")?.minRole).toBe(
      "contributor",
    );
    expect(registry.capabilities.get("term:region:manage")?.minRole).toBe(
      "editor",
    );
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

  test("registerTermMetaBox rejects a duplicate id across plugins", async () => {
    const hooks = new HookRegistry();
    const first = definePlugin("a", (ctx) => {
      ctx.registerTermMetaBox("branding", {
        label: "A",
        termTaxonomies: ["category"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
        ],
      });
    });
    const second = definePlugin("b", (ctx) => {
      ctx.registerTermMetaBox("branding", {
        label: "B",
        termTaxonomies: ["category"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [first, second] }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  test("registerEntryMetaBox rejects an invalid field key at registration time", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("bad", (ctx) => {
      ctx.registerEntryMetaBox("seo", {
        label: "SEO",
        entryTypes: ["post"],
        fields: [
          { key: "bad key!", label: "Bad", type: "string", inputType: "text" },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /invalid key "bad key!"/,
    );
  });

  test("registerEntryMetaBox rejects a field key longer than the RPC write path accepts", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("long", (ctx) => {
      ctx.registerEntryMetaBox("seo", {
        label: "SEO",
        entryTypes: ["post"],
        fields: [
          {
            key: "k".repeat(201),
            label: "Long",
            type: "string",
            inputType: "text",
          },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toMatchObject({ code: "meta_box_field_invalid_key" });
  });

  test("registerEntryMetaBox rejects the reserved __plumix_ key prefix", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("rsv", (ctx) => {
      ctx.registerEntryMetaBox("snap", {
        label: "Snap",
        entryTypes: ["post"],
        fields: [
          {
            key: "__plumix_snapshot",
            label: "Snapshot",
            type: "string",
            inputType: "text",
          },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /reserved `__plumix_` prefix/,
    );
  });

  test("registerTermMetaBox rejects a duplicate field key within the same box", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe", (ctx) => {
      ctx.registerTermMetaBox("branding", {
        label: "Branding",
        termTaxonomies: ["category"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
          { key: "icon", label: "Icon 2", type: "string", inputType: "text" },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /declares field "icon" more than once/,
    );
  });

  test("registerUserMetaBox rejects a duplicate id across plugins", async () => {
    const hooks = new HookRegistry();
    const first = definePlugin("a", (ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "A",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        ],
      });
    });
    const second = definePlugin("b", (ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "B",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [first, second] }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  test("registerUserMetaBox rejects an invalid field key at registration time", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("bad", (ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        fields: [
          {
            key: "bad key!",
            label: "Bad",
            type: "string",
            inputType: "text",
          },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /invalid key "bad key!"/,
    );
  });

  test("registerUserMetaBox rejects a duplicate field key within the same box", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe", (ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
          { key: "bio", label: "Bio 2", type: "string", inputType: "textarea" },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /declares field "bio" more than once/,
    );
  });
});

describe("plugin id validation", () => {
  test("definePlugin rejects an empty id", () => {
    expect(() => definePlugin("", () => undefined)).toThrow(/between 1 and/);
  });

  test("definePlugin rejects an id longer than 64 chars", () => {
    expect(() => definePlugin("a".repeat(65), () => undefined)).toThrow(
      /between 1 and 64/,
    );
  });

  test.each([
    ["starts with digit", "1menus"],
    ["starts with underscore", "_menus"],
    ["contains uppercase", "Menus"],
    ["contains space", "nav menu"],
    ["contains dot", "plumix.menus"],
    ["contains slash", "foo/bar"],
  ])("definePlugin rejects invalid id: %s", (_name, id) => {
    expect(() => definePlugin(id, () => undefined)).toThrow(/must match/);
  });

  test.each([
    ["lowercase alpha", "menus"],
    ["lowercase + digits", "plugin2"],
    ["kebab-case", "plumix-media"],
    ["snake_case", "plumix_media"],
    ["single-letter", "a"],
  ])("definePlugin accepts valid id: %s", (_name, id) => {
    expect(() => definePlugin(id, () => undefined)).not.toThrow();
  });

  test("installPlugins rejects duplicate plugin ids in config", async () => {
    const hooks = new HookRegistry();
    const first = definePlugin("menus", (ctx) => {
      ctx.registerCapability("first:cap", "admin");
    });
    const second = definePlugin("menus", (ctx) => {
      ctx.registerCapability("second:cap", "admin");
    });
    await expect(
      installPlugins({ hooks, plugins: [first, second] }),
    ).rejects.toThrow(/"menus" appears more than once/);
  });

  test("installPlugins re-validates id format defensively (hand-rolled descriptor)", async () => {
    const hooks = new HookRegistry();
    const bad = { id: "Bad Id", setup: () => void 0 };
    await expect(installPlugins({ hooks, plugins: [bad] })).rejects.toThrow(
      /must match/,
    );
  });
});

describe("registerRpcRouter", () => {
  const list = base.handler(() => "ok");

  test("stores the router under the plugin id", async () => {
    const hooks = new HookRegistry();
    const sentinel = { list };
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerRpcRouter(sentinel);
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.rpcRouters.get("menus")).toBe(sentinel);
  });

  test("accepts procedures, sub-routers and lazy nodes, nothing else", () => {
    expectTypeOf<{ list: typeof list }>().toExtend<PluginRpcRouter>();
    expectTypeOf<{
      locations: { list: typeof list };
    }>().toExtend<PluginRpcRouter>();
    expectTypeOf<{
      sub: Lazy<{ list: typeof list }>;
    }>().toExtend<PluginRpcRouter>();
    expectTypeOf<{ list: () => string }>().not.toExtend<PluginRpcRouter>();
  });

  test.each(["auth", "entry", "term", "user", "lookup", "search", "settings"])(
    "rejects plugin id `%s` that collides with a core RPC namespace",
    async (pluginId) => {
      const hooks = new HookRegistry();
      const plugin = definePlugin(pluginId, (ctx) => {
        ctx.registerRpcRouter({});
      });
      await expect(
        installPlugins({ hooks, plugins: [plugin] }),
      ).rejects.toThrow(/collides with core RPC namespace/);
    },
  );
});

describe("registerMcpTool", () => {
  const tool = (name: string) => ({
    name,
    description: "d",
    inputSchema: object({}),
    run: () => null,
  });

  test("stores the tool under its name with plugin attribution", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerMcpTool(tool("media_list"));
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.mcpTools.get("media_list")?.registeredBy).toBe("media");
  });
});

describe("registerAdminPage nav.group validation", () => {
  test.each([
    ["starts with digit", "1group"],
    ["uppercase", "Appearance"],
    ["contains space", "my group"],
    ["empty", ""],
  ])("rejects invalid group id: %s", async (_name, id) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage({
        path: "/menus",
        title: "Menus",
        nav: { group: id, label: "Menus" },
        component: "MenusPage",
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });
});

describe("registerAdminPage", () => {
  const page = {
    path: "/menus",
    title: "Menus",
    component: "MenusPage",
  };

  test("stores the page keyed by path", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage(page);
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const entry = registry.adminPages.get("/menus");
    expect(entry).toEqual(
      expect.objectContaining({
        path: "/menus",
        title: "Menus",
        registeredBy: "menus",
      }),
    );
  });

  test.each([
    ["relative", "menus"],
    ["double-slash", "/menus//edit"],
    ["parent traversal", "/menus/../settings"],
    ["wildcard", "/menus/*"],
    ["query inline", "/menus?q=1"],
    ["fragment inline", "/menus#top"],
  ])("rejects invalid path shape: %s", async (_name, path) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage({ ...page, path });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });

  test("rejects empty component ref", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage({
        ...page,
        component: "",
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /invalid component ref/,
    );
  });
});

describe("registerFieldType", () => {
  const componentRef = "MediaPickerField";

  test("stores the field type keyed by type string", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerFieldType({
        type: "media_picker",
        component: componentRef,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.fieldTypes.get("media_picker")).toEqual(
      expect.objectContaining({
        type: "media_picker",
        registeredBy: "media",
      }),
    );
  });

  test.each(["mediaList", "media-list"])(
    "accepts %j as a type name",
    async (type) => {
      const hooks = new HookRegistry();
      const plugin = definePlugin("media", (ctx) => {
        ctx.registerFieldType({ type, component: componentRef });
      });
      const { registry } = await installPlugins({ hooks, plugins: [plugin] });
      expect(registry.fieldTypes.has(type)).toBe(true);
    },
  );

  test.each(["Media List", "MediaList"])(
    "rejects %j as a type name",
    async (type) => {
      const hooks = new HookRegistry();
      const plugin = definePlugin("media", (ctx) => {
        ctx.registerFieldType({ type, component: componentRef });
      });
      await expect(
        installPlugins({ hooks, plugins: [plugin] }),
      ).rejects.toThrow(`invalid name "${type}"`);
    },
  );

  test("requires a component ref (no optional fallback to dispatcher)", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerFieldType({
        type: "color",
        component: "",
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /invalid component ref/,
    );
  });
});

describe("registerRoute", () => {
  const noop = () => new Response("ok");

  test("stores route metadata with the plugin id attached", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        handler: noop,
      });
      ctx.registerRoute({
        method: "GET",
        path: "/storage/*",
        auth: "public",
        handler: noop,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.rawRoutes).toEqual([
      expect.objectContaining({
        pluginId: "media",
        method: "POST",
        path: "/upload",
        auth: "authenticated",
      }),
      expect.objectContaining({
        pluginId: "media",
        method: "GET",
        path: "/storage/*",
        auth: "public",
      }),
    ]);
  });

  test("carries the CDN opt-in onto the registered route", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("og", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/card/*",
        auth: "public",
        cacheable: true,
        handler: noop,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.rawRoutes[0]?.cacheable).toBe(true);
  });

  test("rejects the CDN opt-in on a route that is not public", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("og", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/card/*",
        auth: "authenticated",
        cacheable: true,
        handler: noop,
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /GET \/card\/\* is not public/,
    );
  });

  // Load-bearing beyond consistency: the dispatcher's read-through happens
  // *outside* the per-route auth gate, so a cacheable dev route would serve a
  // stored answer to an off-loopback request without the gate ever running.
  test("rejects the CDN opt-in on a development route", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("og", (ctx) => {
      ctx.registerRoute({
        method: "GET",
        path: "/preview/*",
        auth: "development",
        cacheable: true,
        handler: noop,
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /GET \/preview\/\* is not public/,
    );
  });

  test("carries the form-post opt-out onto the registered route", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("forms", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/submit",
        auth: "public",
        formPost: true,
        handler: noop,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.rawRoutes[0]?.formPost).toBe(true);
  });

  test("rejects the form-post opt-out on a route that is not public", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("forms", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/submit",
        auth: "authenticated",
        formPost: true,
        handler: noop,
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /POST \/submit is not public/,
    );
  });

  test.each([
    ["relative", "upload"],
    ["double-slash", "/uploads//raw"],
    ["parent traversal", "/upload/../etc"],
    ["query inline", "/upload?size=1"],
    ["fragment inline", "/upload#foo"],
    ["wildcard mid-path", "/upload/*/raw"],
    ["wildcard without slash separator", "/prefix*"],
  ])("rejects invalid path shape: %s", async (_name, path) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path,
        auth: "public",
        handler: noop,
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });
});

describe("registerPublicRoute", () => {
  const noop = () => new Response("ok");

  test("stores the route with the plugin id attached", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("feeds", (ctx) => {
      ctx.registerPublicRoute({ path: "/feed", handler: noop });
      ctx.registerPublicRoute({
        path: "/sitemap.xml",
        cacheable: true,
        handler: noop,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.publicRoutes).toEqual([
      expect.objectContaining({ pluginId: "feeds", path: "/feed" }),
      expect.objectContaining({
        pluginId: "feeds",
        path: "/sitemap.xml",
        cacheable: true,
      }),
    ]);
  });

  test.each([
    ["relative", "feed"],
    ["double-slash", "/blog//feed"],
    ["parent traversal", "/blog/../etc"],
    ["query inline", "/feed?format=atom"],
    ["fragment inline", "/feed#top"],
  ])("rejects invalid path shape: %s", async (_name, path) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("feeds", (ctx) => {
      ctx.registerPublicRoute({ path, handler: noop });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });
});

describe("registerLoginLink", () => {
  test("stores entries with the plugin id attached", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("saml-microsoft", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "Sign in with Microsoft",
        href: "/_plumix/saml-microsoft/start",
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.loginLinks).toEqual([
      expect.objectContaining({
        registeredBy: "saml-microsoft",
        key: "default",
        label: "Sign in with Microsoft",
        href: "/_plumix/saml-microsoft/start",
      }),
    ]);
  });

  test("two plugins can each contribute one button", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("plugin-a", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "A",
        href: "/_plumix/plugin-a/start",
      });
    });
    const b = definePlugin("plugin-b", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "B",
        href: "/_plumix/plugin-b/start",
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [a, b],
    });
    expect(registry.loginLinks).toHaveLength(2);
  });

  test("rejects duplicate key from the same plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "First",
        href: "/_plumix/acme/start",
      });
      ctx.registerLoginLink({
        key: "default",
        label: "Second",
        href: "/_plumix/acme/start",
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /already registered/,
    );
  });

  test.each([
    ["uppercase key", "Default"],
    ["empty key", ""],
    ["over 32 chars", "x".repeat(33)],
    ["dot in key", "default.alt"],
    ["digit start", "1auth"],
  ])("rejects invalid key: %s", async (_name, key) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key,
        label: "x",
        href: "/_plumix/acme/start",
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });

  test("rejects an empty label", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "",
        href: "/_plumix/acme/start",
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /empty label/,
    );
  });

  test("rejects a label with CR/LF (header-injection defense)", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "Sign in\r\nwith something",
        href: "/_plumix/acme/start",
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /CR\/LF/,
    );
  });

  test.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>"],
    ["bare http", "http://insecure.example/start"],
    ["protocol-relative", "//evil.example/start"],
    ["relative without leading slash", "_plumix/acme/start"],
  ])("rejects unsafe href: %s", async (_name, href) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "x",
        href,
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });

  test("accepts an https:// absolute href", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerLoginLink({
        key: "default",
        label: "x",
        href: "https://idp.example.com/saml/login",
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.loginLinks[0]?.href).toBe(
      "https://idp.example.com/saml/login",
    );
  });
});

describe("registerScheduledTask", () => {
  test("stores entries with the plugin id attached", async () => {
    const hooks = new HookRegistry();
    const handler = () => undefined;
    const plugin = definePlugin("audit-log", (ctx) => {
      ctx.registerScheduledTask({
        id: "retention-purge",
        cron: "0 3 * * *",
        handler,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.scheduledTasks).toEqual([
      {
        id: "retention-purge",
        cron: "0 3 * * *",
        handler,
        registeredBy: "audit-log",
      },
    ]);
  });

  test("two plugins can each contribute one task", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("plugin-a", (ctx) => {
      ctx.registerScheduledTask({ id: "t", handler: () => undefined });
    });
    const b = definePlugin("plugin-b", (ctx) => {
      ctx.registerScheduledTask({ id: "t", handler: () => undefined });
    });
    const { registry } = await installPlugins({ hooks, plugins: [a, b] });
    expect(registry.scheduledTasks).toHaveLength(2);
    expect(registry.scheduledTasks.map((task) => task.registeredBy)).toEqual([
      "plugin-a",
      "plugin-b",
    ]);
  });

  test("rejects duplicate id from the same plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerScheduledTask({ id: "purge", handler: () => undefined });
      ctx.registerScheduledTask({ id: "purge", handler: () => undefined });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /already registered/,
    );
  });

  test.each([
    ["empty id", ""],
    ["over 64 chars", "x".repeat(65)],
    ["space in id", "bad id"],
    ["dot in id", "audit.log"],
    ["leading dash", "-cleanup"],
  ])("rejects invalid id: %s", async (_name, id) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerScheduledTask({ id, handler: () => undefined });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /invalid id/,
    );
  });

  test("accepts compound ids with slashes and underscores", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("audit-log", (ctx) => {
      ctx.registerScheduledTask({
        id: "retention/daily_purge",
        handler: () => undefined,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.scheduledTasks[0]?.id).toBe("retention/daily_purge");
  });

  test("cron is optional — task without one still registers", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("p", (ctx) => {
      ctx.registerScheduledTask({ id: "t", handler: () => undefined });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.scheduledTasks[0]?.cron).toBeUndefined();
  });
});

describe("registerPattern", () => {
  test("stores the registered pattern keyed by slug, tagged with the plugin id", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerPattern({
        name: "acme/hero",
        title: "Hero",
        category: "hero",
        content: [],
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    expect(registry.patternSpecs.has("acme/hero")).toBe(true);
    expect(registry.patternSpecs.get("acme/hero")?.registeredBy).toBe("acme");
    expect(registry.patternSpecs.get("acme/hero")?.spec.title).toBe("Hero");
  });

  test("throws when two plugins register the same pattern slug", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("a", (ctx) => {
      ctx.registerPattern({ name: "shared/hero", title: "A", content: [] });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerPattern({ name: "shared/hero", title: "B", content: [] });
    });

    await expect(installPlugins({ hooks, plugins: [a, b] })).rejects.toThrow(
      DuplicateRegistrationError,
    );
  });
});

describe("registerShortcode", () => {
  test("stores the registered shortcode keyed by tag, tagged with the plugin id", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerShortcode({
        name: "reading-time",
        render: () => "3 min",
      });
    });

    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    expect(registry.shortcodeSpecs.has("reading-time")).toBe(true);
    expect(registry.shortcodeSpecs.get("reading-time")?.registeredBy).toBe(
      "seo",
    );
  });

  test("throws when two plugins register the same shortcode tag", async () => {
    const hooks = new HookRegistry();
    const a = definePlugin("a", (ctx) => {
      ctx.registerShortcode({ name: "cite", render: () => "[1]" });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerShortcode({ name: "cite", render: () => "[2]" });
    });

    await expect(installPlugins({ hooks, plugins: [a, b] })).rejects.toThrow(
      DuplicateRegistrationError,
    );
  });
});

describe("afterSetup", () => {
  const blog = definePlugin("blog", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      entryTypes: ["post"],
    });
  });

  test("reads what every plugin registered, wherever it is installed", async () => {
    let seen: readonly string[] = [];
    // Installed first, so what it reads can only come from the later plugin's
    // registrations rather than from install order.
    const feeds = definePlugin("feeds", {
      setup: () => undefined,
      afterSetup: (ctx) => {
        seen = [
          ...ctx.plugins.entryTypes.keys(),
          ...ctx.plugins.termTaxonomies.keys(),
        ];
      },
    });

    await installPlugins({ hooks: new HookRegistry(), plugins: [feeds, blog] });

    expect(seen).toEqual(["post", "category"]);
  });

  test("runs once every plugin's setup has", async () => {
    const order: string[] = [];
    const early = definePlugin("early", {
      setup: () => void order.push("early:setup"),
      afterSetup: () => void order.push("early:afterSetup"),
    });
    const late = definePlugin("late", () => void order.push("late:setup"));

    await installPlugins({ hooks: new HookRegistry(), plugins: [early, late] });

    expect(order).toEqual(["early:setup", "late:setup", "early:afterSetup"]);
  });

  test("lands its registrations in the registry installPlugins returns", async () => {
    const feeds = definePlugin("feeds", {
      setup: () => undefined,
      afterSetup: (ctx) => {
        for (const type of ctx.plugins.entryTypes.keys()) {
          ctx.registerPublicRoute({
            path: `/${type}/feed`,
            handler: () => new Response("feed"),
          });
        }
      },
    });

    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [feeds, blog],
    });

    expect(registry.publicRoutes.map((route) => route.path)).toEqual([
      "/post/feed",
    ]);
  });

  test("is the only phase offered the registry", async () => {
    let offered: boolean | undefined;
    const reader = definePlugin("reader", (ctx) => {
      offered = "plugins" in ctx;
    });

    await installPlugins({ hooks: new HookRegistry(), plugins: [reader] });

    expect(offered).toBe(false);
  });
});

describe("reserved settings group names", () => {
  test("registerSettingsGroup rejects the `_internal` suffix at boot", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("rsv", (ctx) => {
      ctx.registerSettingsGroup("rsv_internal", {
        label: "Private",
        fields: [],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /reserved for server-only rows/,
    );
  });
});

describe("settings group field keys", () => {
  test("registerSettingsGroup rejects a field key longer than the RPC write path accepts", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("long", (ctx) => {
      ctx.registerSettingsGroup("long", {
        label: "Long",
        fields: [
          {
            key: "k".repeat(201),
            label: "Long",
            type: "string",
            inputType: "text",
          },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toMatchObject({ code: "meta_box_field_invalid_key" });
  });
});

type Variant = "first" | "second";

// Which plugins a registrar refuses a second registration from: every plugin,
// only the one that holds it ("plugin"), or only itself because the key is
// derived from its own id ("self").
type DuplicateScope = "global" | "plugin" | "self";

interface DuplicateCase {
  readonly kind: string;
  readonly identifier: string;
  readonly scope: DuplicateScope;
  // Registers the row's key, carrying `variant` in a field `read` gets back.
  readonly register: (
    ctx: PluginSetupContext,
    variant: Variant,
    pluginId: string,
  ) => void;
  readonly read: (
    registry: PluginRegistry,
    pluginId: string,
  ) => string | undefined | Promise<string | undefined>;
  // Registers an identifier core already holds once the core seeders ran;
  // `coreHolds` reads back that core still does.
  readonly core?: {
    readonly identifier: string;
    readonly register: (ctx: PluginSetupContext) => void;
    readonly coreHolds: (registry: PluginRegistry) => boolean;
  };
}

const variantMinRole = { first: "editor", second: "admin" } as const;
const variantAuth = { first: "authenticated", second: "public" } as const;
const variantCron = { first: "0 3 * * *", second: "0 4 * * *" } as const;
const noopHandler = () => new Response("ok");
const noopLookup: LookupAdapter = { list: () => Promise.resolve([]) };
const textField = {
  key: "note",
  label: "Note",
  type: "string",
  inputType: "text",
} as const;

const duplicateCases: readonly DuplicateCase[] = [
  {
    kind: "entry type",
    identifier: "docs",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerEntryType("docs", { label: variant });
    },
    read: (registry) => labelText(registry.entryTypes.get("docs")?.label),
  },
  {
    kind: "term taxonomy",
    identifier: "topic",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerTermTaxonomy("topic", { label: variant });
    },
    read: (registry) => labelText(registry.termTaxonomies.get("topic")?.label),
  },
  {
    kind: "entry meta box",
    identifier: "extra",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerEntryMetaBox("extra", {
        label: variant,
        entryTypes: ["post"],
        fields: [textField],
      });
    },
    read: (registry) => labelText(registry.entryMetaBoxes.get("extra")?.label),
  },
  {
    kind: "term meta box",
    identifier: "extra",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerTermMetaBox("extra", {
        label: variant,
        termTaxonomies: ["category"],
        fields: [textField],
      });
    },
    read: (registry) => labelText(registry.termMetaBoxes.get("extra")?.label),
  },
  {
    kind: "user meta box",
    identifier: "extra",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerUserMetaBox("extra", { label: variant, fields: [textField] });
    },
    read: (registry) => labelText(registry.userMetaBoxes.get("extra")?.label),
  },
  {
    kind: "capability",
    identifier: "report:export",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerCapability("report:export", variantMinRole[variant]);
    },
    read: (registry) =>
      variantOf(
        variantMinRole,
        registry.capabilities.get("report:export")?.minRole,
      ),
  },
  {
    kind: "settings group",
    identifier: "extra",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerSettingsGroup("extra", { label: variant, fields: [] });
    },
    read: (registry) => labelText(registry.settingsGroups.get("extra")?.label),
    core: {
      identifier: "site",
      register: (ctx) => {
        ctx.registerSettingsGroup("site", { label: "Site", fields: [] });
      },
      coreHolds: (registry) =>
        registry.settingsGroups.get("site")?.registeredBy === null,
    },
  },
  {
    kind: "settings page",
    identifier: "extra",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerSettingsPage("extra", { label: variant, groups: [] });
    },
    read: (registry) => labelText(registry.settingsPages.get("extra")?.label),
    core: {
      identifier: "general",
      register: (ctx) => {
        ctx.registerSettingsPage("general", { label: "General", groups: [] });
      },
      coreHolds: (registry) =>
        registry.settingsPages.get("general")?.registeredBy === null,
    },
  },
  {
    kind: "archive type",
    identifier: "series",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerArchiveType("series", {
        routes: [`/${variant}/:slug`],
        resolve: () => null,
      });
    },
    read: (registry) =>
      registry.archiveTypes.get("series")?.routes[0]?.split("/")[1],
  },
  {
    kind: "plugin RPC router",
    identifier: "repeater",
    scope: "self",
    register: (ctx, variant) => {
      ctx.registerRpcRouter({ [variant]: base.handler(() => "ok") });
    },
    read: (registry, pluginId) =>
      Object.keys(registry.rpcRouters.get(pluginId) ?? {})[0],
  },
  {
    kind: "MCP tool",
    identifier: "report_list",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerMcpTool({
        name: "report_list",
        description: variant,
        inputSchema: object({}),
        run: () => null,
      });
    },
    read: (registry) => registry.mcpTools.get("report_list")?.tool.description,
    core: {
      identifier: "schema_describe",
      register: (ctx) => {
        ctx.registerMcpTool({
          name: "schema_describe",
          description: "d",
          inputSchema: object({}),
          run: () => null,
        });
      },
      coreHolds: (registry) => !registry.mcpTools.has("schema_describe"),
    },
  },
  {
    kind: "route",
    identifier: "POST /upload",
    scope: "plugin",
    register: (ctx, variant) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: variantAuth[variant],
        handler: noopHandler,
      });
    },
    read: (registry, pluginId) =>
      variantOf(
        variantAuth,
        onlyOne(registry.rawRoutes.filter((r) => r.pluginId === pluginId))
          ?.auth,
      ),
  },
  {
    kind: "admin page",
    identifier: "/reports",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerAdminPage({
        path: "/reports",
        title: variant,
        component: "ReportsPage",
      });
    },
    read: (registry) => labelText(registry.adminPages.get("/reports")?.title),
  },
  {
    kind: "dashboard widget",
    identifier: "repeater:stats",
    scope: "self",
    register: (ctx, variant) => {
      ctx.registerDashboardWidget({
        id: "repeater:stats",
        title: variant,
        component: "Stats",
      });
    },
    read: (registry) =>
      labelText(registry.dashboardWidgets.get("repeater:stats")?.title),
  },
  {
    kind: "field type",
    identifier: "color",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerFieldType({ type: "color", component: `${variant}Field` });
    },
    read: (registry) =>
      registry.fieldTypes.get("color")?.component.replace(/Field$/, ""),
  },
  {
    kind: "block",
    identifier: "acme/hero",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerBlock(
        defineBlock({ name: "acme/hero", title: variant, render: () => null }),
      );
    },
    read: (registry) =>
      labelText(registry.blockSpecs.get("acme/hero")?.spec.title),
  },
  {
    kind: "mark",
    identifier: "highlight",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerMark({ name: "highlight", title: variant });
    },
    read: (registry) => registry.markSpecs.get("highlight")?.spec.title,
  },
  {
    kind: "shortcode",
    identifier: "cite",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerShortcode({ name: "cite", render: () => variant });
    },
    read: (registry) =>
      registry.shortcodeSpecs
        .get("cite")
        ?.spec.render({ atts: {}, context: {} as never }),
  },
  {
    kind: "pattern",
    identifier: "shared/hero",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerPattern({ name: "shared/hero", title: variant, content: [] });
    },
    read: (registry) =>
      labelText(registry.patternSpecs.get("shared/hero")?.spec.title),
  },
  {
    kind: "lookup adapter",
    identifier: "report",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerLookupAdapter({
        kind: "report",
        adapter: noopLookup,
        capability: variant,
      });
    },
    read: (registry) =>
      registry.lookupAdapters.get("report")?.capability ?? undefined,
    core: {
      identifier: "user",
      register: (ctx) => {
        ctx.registerLookupAdapter({ kind: "user", adapter: noopLookup });
      },
      coreHolds: (registry) =>
        registry.lookupAdapters.get("user")?.registeredBy === null,
    },
  },
  {
    kind: "image role",
    identifier: "dup-role",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerImageRole("dup-role", { single: variant === "first" });
    },
    read: (registry) => {
      const role = registry.imageRoles.get("dup-role");
      if (role === undefined) return undefined;
      return role.single ? "first" : "second";
    },
    core: {
      identifier: "featured",
      register: (ctx) => {
        ctx.registerImageRole("featured", { single: false });
      },
      coreHolds: (registry) =>
        registry.imageRoles.get("featured")?.registeredBy === null,
    },
  },
  {
    kind: "login link",
    identifier: "default",
    scope: "plugin",
    register: (ctx, variant, pluginId) => {
      ctx.registerLoginLink({
        key: "default",
        label: variant,
        href: `/_plumix/${pluginId}/start`,
      });
    },
    read: (registry, pluginId) =>
      labelText(
        onlyOne(registry.loginLinks.filter((l) => l.registeredBy === pluginId))
          ?.label,
      ),
  },
  {
    kind: "scheduled task",
    identifier: "purge",
    scope: "plugin",
    register: (ctx, variant) => {
      ctx.registerScheduledTask({
        id: "purge",
        cron: variantCron[variant],
        handler: () => undefined,
      });
    },
    read: (registry, pluginId) =>
      variantOf(
        variantCron,
        onlyOne(
          registry.scheduledTasks.filter((t) => t.registeredBy === pluginId),
        )?.cron,
      ),
  },
  {
    kind: "template dep",
    identifier: "dup-thing",
    scope: "global",
    register: (ctx, variant) => {
      ctx.registerTemplateDep("dup-thing", {
        keyedBy: "slug",
        load: () => Promise.resolve({ probe: variant }),
      });
    },
    read: async (registry) => {
      const ctx = createTestContext({
        db: await createTestDb(),
        plugins: registry,
      });
      const loaded = await registry.templateDeps
        .get("dup-thing")
        ?.load(["probe"], ctx);
      return loaded === undefined ? undefined : String(loaded.probe);
    },
    core: {
      identifier: "settings",
      register: (ctx) => {
        ctx.registerTemplateDep("settings", {
          keyedBy: "slug",
          load: () => Promise.resolve({}),
        });
      },
      coreHolds: (registry) =>
        registry.templateDeps.get("settings")?.registeredBy === null,
    },
  },
];

function labelText(label: Label | undefined): string | undefined {
  return typeof label === "string" ? label : label?.message;
}

function variantOf<T>(
  byVariant: Readonly<Record<Variant, T>>,
  value: T | undefined,
): Variant | undefined {
  return (Object.keys(byVariant) as Variant[]).find(
    (variant) => byVariant[variant] === value,
  );
}

function onlyOne<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function seededRegistry() {
  const registry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  registerCoreTemplateDeps(registry);
  registerCoreSettings(registry);
  return registry;
}

describe("duplicate registration", () => {
  describe.each(duplicateCases.filter((row) => row.scope === "global"))(
    "$kind",
    (row) => {
      test("names the plugin that already registered it", async () => {
        const hooks = new HookRegistry();
        const registry = createPluginRegistry();
        const first = definePlugin("first-owner", (ctx) => {
          row.register(ctx, "first", "first-owner");
        });
        const second = definePlugin("second-owner", (ctx) => {
          row.register(ctx, "second", "second-owner");
        });

        const install = installPlugins({
          hooks,
          registry,
          plugins: [first, second],
        });

        await expect(install).rejects.toThrow(
          `Plugin "second-owner" registers ${row.kind} "${row.identifier}" already registered by "first-owner".`,
        );
        await expect(install).rejects.toMatchObject({
          name: "DuplicateRegistrationError",
          kind: row.kind,
          identifier: row.identifier,
          pluginId: "second-owner",
          previousOwner: "first-owner",
        });
        expect(await row.read(registry, "first-owner")).toBe("first");
      });
    },
  );

  describe.each(duplicateCases.filter((row) => row.scope === "plugin"))(
    "$kind",
    (row) => {
      test("lets another plugin reuse the identifier", async () => {
        const hooks = new HookRegistry();
        const first = definePlugin("first-owner", (ctx) => {
          row.register(ctx, "first", "first-owner");
        });
        const second = definePlugin("second-owner", (ctx) => {
          row.register(ctx, "second", "second-owner");
        });

        const { registry } = await installPlugins({
          hooks,
          plugins: [first, second],
        });

        expect(await row.read(registry, "first-owner")).toBe("first");
        expect(await row.read(registry, "second-owner")).toBe("second");
      });
    },
  );

  describe.each(duplicateCases)("$kind", (row) => {
    test("tells a plugin it already registered it", async () => {
      const hooks = new HookRegistry();
      const registry = createPluginRegistry();
      const plugin = definePlugin("repeater", (ctx) => {
        row.register(ctx, "first", "repeater");
        row.register(ctx, "second", "repeater");
      });

      const install = installPlugins({ hooks, registry, plugins: [plugin] });

      await expect(install).rejects.toThrow(
        `Plugin "repeater" registers ${row.kind} "${row.identifier}", which it already registered.`,
      );
      await expect(install).rejects.toMatchObject({
        name: "DuplicateRegistrationError",
        kind: row.kind,
        identifier: row.identifier,
        pluginId: "repeater",
        previousOwner: "repeater",
      });
      expect(await row.read(registry, "repeater")).toBe("first");
    });
  });

  const coreCases = duplicateCases.flatMap((row) =>
    row.core ? [{ kind: row.kind, ...row.core }] : [],
  );

  describe.each(coreCases)("$kind", (row) => {
    test("names core when core holds the identifier", async () => {
      const hooks = new HookRegistry();
      const plugin = definePlugin("rogue", (ctx) => {
        row.register(ctx);
      });

      const registry = seededRegistry();

      const install = installPlugins({ hooks, registry, plugins: [plugin] });

      await expect(install).rejects.toThrow(
        `Plugin "rogue" registers ${row.kind} "${row.identifier}" already registered by core.`,
      );
      await expect(install).rejects.toMatchObject({
        name: "DuplicateRegistrationError",
        kind: row.kind,
        identifier: row.identifier,
        pluginId: "rogue",
        previousOwner: null,
      });
      expect(row.coreHolds(registry)).toBe(true);
    });
  });

  test("checks each spec registerBlocks is given", async () => {
    const hooks = new HookRegistry();
    const registry = createPluginRegistry();
    const plugin = definePlugin("acme", (ctx) => {
      ctx.registerBlocks([
        defineBlock({ name: "acme/hero", title: "first", render: () => null }),
        defineBlock({ name: "acme/hero", title: "second", render: () => null }),
      ]);
    });

    await expect(
      installPlugins({ hooks, registry, plugins: [plugin] }),
    ).rejects.toThrow(
      'Plugin "acme" registers block "acme/hero", which it already registered.',
    );
    expect(labelText(registry.blockSpecs.get("acme/hero")?.spec.title)).toBe(
      "first",
    );
  });

  test("treats a capability derived from the plugin's own entry type as its own", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerCapability("entry:post:edit_own", "author");
    });

    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      'Plugin "blog" registers capability "entry:post:edit_own", which it already registered.',
    );
  });

  test("raises the duplicate before validation that follows the check", async () => {
    const hooks = new HookRegistry();
    const registry = createPluginRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage({
        path: "/menus",
        title: "Menus",
        component: "MenusPage",
      });
      ctx.registerAdminPage({ path: "/menus", title: "Dupe", component: "" });
    });

    await expect(
      installPlugins({ hooks, registry, plugins: [plugin] }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
    expect(labelText(registry.adminPages.get("/menus")?.title)).toBe("Menus");
  });

  test("raises validation that precedes the check before the duplicate", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        handler: noopHandler,
      });
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        cacheable: true,
        handler: noopHandler,
      });
    });

    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /POST \/upload is not public/,
    );
  });
});
