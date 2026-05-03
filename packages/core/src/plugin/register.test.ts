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
  test("stores the router under the plugin id", async () => {
    const hooks = new HookRegistry();
    const sentinel = { list: () => "ok" };
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerRpcRouter(sentinel);
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.rpcRouters.get("menus")).toBe(sentinel);
  });

  test("rejects a second registration from the same plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerRpcRouter({ list: () => "ok" });
      ctx.registerRpcRouter({ list: () => "nope" });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /plugin RPC router "menus" is already registered/,
    );
  });

  test.each(["auth", "entry", "term", "user", "settings"])(
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

  test("rejects duplicate paths within a single plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("menus", (ctx) => {
      ctx.registerAdminPage(page);
      ctx.registerAdminPage({ ...page, title: "Dupe" });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /admin page "\/menus" is already registered/,
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

describe("registerBlock", () => {
  const componentRef = "ImageNodeView";

  test("stores the block keyed by name with registeredBy attribution", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerBlock({
        name: "image",
        kind: "node",
        schema: { group: "block", inline: false, draggable: true },
        component: componentRef,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.blocks.get("image")).toEqual(
      expect.objectContaining({
        name: "image",
        kind: "node",
        registeredBy: "media",
      }),
    );
  });

  test("accepts a block without a NodeView component", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerBlock({
        name: "callout",
        kind: "node",
        schema: { group: "block" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(registry.blocks.get("callout")?.component).toBeUndefined();
  });

  test("rejects duplicate block name within a plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerBlock({ name: "image", kind: "node", schema: {} });
      ctx.registerBlock({ name: "image", kind: "mark", schema: {} });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /block "image" is already registered/,
    );
  });

  test.each([
    ["uppercase", "Image"],
    ["starts with digit", "1image"],
    ["contains dot", "media.image"],
    ["empty", ""],
  ])("rejects invalid block name: %s", async (_name, blockName) => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerBlock({ name: blockName, kind: "node", schema: {} });
    });
    await expect(
      installPlugins({ hooks, plugins: [plugin] }),
    ).rejects.toThrow();
  });

  test("rejects empty component ref", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerBlock({
        name: "image",
        kind: "node",
        schema: {},
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

  test("rejects duplicate type within a plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerFieldType({ type: "color", component: componentRef });
      ctx.registerFieldType({ type: "color", component: componentRef });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /field type "color" is already registered/,
    );
  });

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

  test("rejects a duplicate (method, path) pair from the same plugin", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("media", (ctx) => {
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "authenticated",
        handler: noop,
      });
      ctx.registerRoute({
        method: "POST",
        path: "/upload",
        auth: "public",
        handler: noop,
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /already registered a route for POST \/upload/,
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
