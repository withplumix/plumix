import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import {
  buildManifest,
  createPluginRegistry,
  deriveAdminSlug,
  DuplicateAdminSlugError,
  emptyManifest,
  injectManifestIntoHtml,
  MANIFEST_SCRIPT_ID,
  serializeManifestScript,
} from "./manifest.js";
import { installPlugins } from "./register.js";

describe("buildManifest", () => {
  test("empty registry yields an empty manifest", () => {
    const manifest = buildManifest(createPluginRegistry());
    expect(manifest).toEqual(emptyManifest());
  });

  test("projects registered settings groups, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "General",
        description: "Basic site identity.",
        fieldsets: [
          {
            name: "identity",
            label: "Identity",
            description: "Public-facing site identity.",
            fields: [
              {
                name: "site_title",
                label: "Site title",
                type: "text",
                default: "My Site",
                autoload: true,
              },
              {
                name: "site_description",
                label: "Tagline",
                type: "text",
              },
            ],
          },
        ],
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [corePlugin],
    });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups).toEqual([
      {
        name: "general",
        label: "General",
        description: "Basic site identity.",
        fieldsets: [
          {
            name: "identity",
            label: "Identity",
            description: "Public-facing site identity.",
            fields: [
              {
                name: "site_title",
                label: "Site title",
                type: "text",
                default: "My Site",
                description: undefined,
                placeholder: undefined,
                maxLength: undefined,
                autoload: true,
              },
              {
                name: "site_description",
                label: "Tagline",
                type: "text",
                default: undefined,
                description: undefined,
                placeholder: undefined,
                maxLength: undefined,
                autoload: undefined,
              },
            ],
          },
        ],
      },
    ]);
  });

  test("second plugin appends a fieldset to an existing group", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "General",
        fieldsets: [
          {
            name: "identity",
            fields: [{ name: "site_title", label: "Site title", type: "text" }],
          },
        ],
      });
    });
    const seoPlugin = definePlugin("seo", (ctx) => {
      ctx.registerSettingsFieldset("general", {
        name: "seo",
        label: "SEO",
        fields: [
          {
            name: "meta_description",
            label: "Meta description",
            type: "textarea",
          },
        ],
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [corePlugin, seoPlugin],
    });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups[0]?.fieldsets.map((fs) => fs.name)).toEqual([
      "identity",
      "seo",
    ]);
  });

  test("rejects duplicate settings group registration", async () => {
    const hooks = new HookRegistry();
    const pluginA = definePlugin("a", (ctx) => {
      ctx.registerSettingsGroup("general", { label: "General", fieldsets: [] });
    });
    const pluginB = definePlugin("b", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "Also General",
        fieldsets: [],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [pluginA, pluginB] }),
    ).rejects.toThrow(/settings group "general"/);
  });

  test("rejects adding a fieldset to a non-existent group", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("orphan", (ctx) => {
      ctx.registerSettingsFieldset("nonexistent", {
        name: "x",
        fields: [{ name: "a", label: "A", type: "text" }],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /hasn't been registered yet/,
    );
  });

  test("rejects a fieldset whose name collides with an existing one", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "General",
        fieldsets: [{ name: "identity", fields: [] }],
      });
    });
    const dupe = definePlugin("dupe", (ctx) => {
      ctx.registerSettingsFieldset("general", {
        name: "identity",
        fields: [{ name: "x", label: "X", type: "text" }],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [corePlugin, dupe] }),
    ).rejects.toThrow(/settings fieldset "general\.identity"/);
  });

  test("rejects invalid group / fieldset / field names (must be snake_case ASCII)", async () => {
    const hooks = new HookRegistry();
    const badGroup = definePlugin("a", (ctx) => {
      ctx.registerSettingsGroup("Foo-Bar", {
        label: "x",
        fieldsets: [],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [badGroup] }),
    ).rejects.toThrow(/Invalid settings group name "Foo-Bar"/);

    const badField = definePlugin("b", (ctx) => {
      ctx.registerSettingsGroup("good", {
        label: "x",
        fieldsets: [
          {
            name: "section",
            fields: [{ name: "bad.name", label: "X", type: "text" }],
          },
        ],
      });
    });
    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [badField] }),
    ).rejects.toThrow(/Invalid settings field name "bad\.name"/);

    const badFieldset = definePlugin("c", (ctx) => {
      ctx.registerSettingsGroup("good", { label: "x", fieldsets: [] });
      ctx.registerSettingsFieldset("good", {
        name: "Bad-Section",
        fields: [],
      });
    });
    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [badFieldset] }),
    ).rejects.toThrow(/Invalid settings fieldset name "Bad-Section"/);
  });

  test("rejects a group that exceeds the 200-field cap", async () => {
    const hooks = new HookRegistry();
    const tooMany = definePlugin("big", (ctx) => {
      ctx.registerSettingsGroup("big", {
        label: "x",
        fieldsets: [
          {
            name: "section",
            fields: Array.from({ length: 201 }, (_, i) => ({
              name: `f${i}`,
              label: `Field ${i}`,
              type: "text" as const,
            })),
          },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [tooMany] })).rejects.toThrow(
      /has 201 fields; the admin loader caps a single group at 200/,
    );
  });

  test("rejects a field that collides across fieldsets in the same group", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "General",
        fieldsets: [
          {
            name: "identity",
            fields: [{ name: "site_title", label: "Site title", type: "text" }],
          },
        ],
      });
    });
    const dupe = definePlugin("dupe", (ctx) => {
      ctx.registerSettingsFieldset("general", {
        name: "seo",
        fields: [
          { name: "site_title", label: "Different label", type: "text" },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [corePlugin, dupe] }),
    ).rejects.toThrow(/settings field "general\.site_title"/);
  });

  test("projects registered post types, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        labels: { singular: "Entry" },
        supports: ["title", "editor"],
        taxonomies: ["category"],
        rewrite: { slug: "posts" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [blog] });

    const manifest = buildManifest(registry);

    expect(manifest.entryTypes).toEqual([
      {
        name: "post",
        adminSlug: "posts",
        label: "Posts",
        labels: { singular: "Entry" },
        supports: ["title", "editor"],
        taxonomies: ["category"],
      },
    ]);
    const entry = manifest.entryTypes[0] as unknown as Record<string, unknown>;
    expect(entry.registeredBy).toBeUndefined();
    expect(entry.rewrite).toBeUndefined();
  });

  test("uses labels.plural (slugified) for adminSlug when provided", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("shop", (ctx) => {
      ctx.registerEntryType("product", {
        label: "Product",
        labels: { singular: "Product", plural: "Product Catalog" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(buildManifest(registry).entryTypes[0]?.adminSlug).toBe(
      "product-catalog",
    );
  });

  test("falls back to `${name}s` when labels.plural is not set", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("shop", (ctx) => {
      ctx.registerEntryType("product", { label: "Product" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(buildManifest(registry).entryTypes[0]?.adminSlug).toBe("products");
  });

  test("throws DuplicateAdminSlugError when two types resolve to the same slug", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("clash", (ctx) => {
      ctx.registerEntryType("product", {
        label: "Products",
        labels: { plural: "Items" },
      });
      ctx.registerEntryType("item", { label: "Items" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(DuplicateAdminSlugError);
  });

  test("orders post types by menuPosition, unspecified last", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("mixed", (ctx) => {
      ctx.registerEntryType("late", { label: "Late", menuPosition: 50 });
      ctx.registerEntryType("unpositioned", { label: "Unpositioned" });
      ctx.registerEntryType("early", { label: "Early", menuPosition: 5 });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const names = buildManifest(registry).entryTypes.map((pt) => pt.name);
    expect(names).toEqual(["early", "late", "unpositioned"]);
  });

  test("projects registered meta boxes, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerMetaBox("seo-meta", {
        label: "SEO",
        context: "side",
        priority: "high",
        entryTypes: ["post"],
        capability: "post:edit_any",
        fields: [
          {
            key: "title",
            label: "Meta title",
            inputType: "text",
            maxLength: 60,
          },
          { key: "desc", label: "Meta description", inputType: "textarea" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const manifest = buildManifest(registry);
    expect(manifest.metaBoxes).toEqual([
      {
        id: "seo-meta",
        label: "SEO",
        context: "side",
        priority: "high",
        entryTypes: ["post"],
        capability: "post:edit_any",
        fields: [
          {
            key: "title",
            label: "Meta title",
            inputType: "text",
            maxLength: 60,
          },
          { key: "desc", label: "Meta description", inputType: "textarea" },
        ],
      },
    ]);
    const entry = manifest.metaBoxes[0] as unknown as Record<string, unknown>;
    expect(entry.registeredBy).toBeUndefined();
  });

  test("empty meta-box registry yields an empty metaBoxes array", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    expect(buildManifest(registry).metaBoxes).toEqual([]);
  });

  test("projects registered taxonomies, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerTaxonomy("category", {
        label: "Categories",
        labels: { singular: "Category" },
        description: "Top-level organisation for blog entries.",
        isHierarchical: true,
        entryTypes: ["post"],
        // Server-only / public-site-only fields that should NOT ship to
        // the admin manifest — asserted below.
        isPublic: true,
        isInQuickEdit: true,
        hasAdminColumn: true,
        rewrite: { slug: "category" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [blog] });

    const manifest = buildManifest(registry);
    expect(manifest.taxonomies).toEqual([
      {
        name: "category",
        label: "Categories",
        labels: { singular: "Category" },
        description: "Top-level organisation for blog entries.",
        isHierarchical: true,
        entryTypes: ["post"],
      },
    ]);
    // Operational flags + `registeredBy` stay server-side.
    const entry = manifest.taxonomies[0] as unknown as Record<string, unknown>;
    expect(entry.registeredBy).toBeUndefined();
    expect(entry.isPublic).toBeUndefined();
    expect(entry.isInQuickEdit).toBeUndefined();
    expect(entry.hasAdminColumn).toBeUndefined();
    expect(entry.rewrite).toBeUndefined();
  });

  test("empty taxonomy registry yields an empty taxonomies array", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    expect(buildManifest(registry).taxonomies).toEqual([]);
  });
});

describe("deriveAdminSlug", () => {
  test("slugifies the plural when set", () => {
    expect(deriveAdminSlug("product", "Products")).toBe("products");
    expect(deriveAdminSlug("article", "News & Updates")).toBe("news-updates");
  });

  test("falls back to `${name}s` when plural is unset", () => {
    expect(deriveAdminSlug("post")).toBe("posts");
    expect(deriveAdminSlug("landing_page")).toBe("landing-pages");
  });

  test("throws when the derived slug would be empty", () => {
    expect(() => deriveAdminSlug("x", "---")).toThrow(/empty/);
  });
});

describe("serializeManifestScript", () => {
  test("emits a json script tag with the expected id", () => {
    const tag = serializeManifestScript({
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(tag).toContain(`id="${MANIFEST_SCRIPT_ID}"`);
    expect(tag).toContain(`type="application/json"`);
    expect(tag).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"metaBoxes":[],"settingsGroups":[]}`,
    );
  });

  test("neutralises </ sequences in payload so the tag can't be broken out of", () => {
    const tag = serializeManifestScript({
      entryTypes: [
        { name: "post", adminSlug: "posts", label: "</script><b>x</b>" },
      ],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(tag).not.toContain("</script><b>");
    expect(tag).toMatch(/<\\\/script>/);
  });

  test("round-trips through JSON.parse after unescaping the slash", () => {
    const manifest = {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "x</y>" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    };
    const tag = serializeManifestScript(manifest);
    const prefix = `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">`;
    const suffix = `</script>`;
    expect(tag.startsWith(prefix)).toBe(true);
    expect(tag.endsWith(suffix)).toBe(true);
    const payload = tag.slice(prefix.length, -suffix.length);
    expect(JSON.parse(payload.replaceAll("<\\/", "</"))).toEqual(manifest);
  });
});

describe("injectManifestIntoHtml", () => {
  const TEMPLATE = `<!doctype html><html><body>
<div id="root"></div>
<script id="plumix-manifest" type="application/json">{"entryTypes":[]}</script>
<script type="module" src="/src/main.tsx"></script>
</body></html>`;

  test("replaces the placeholder with the serialised manifest", () => {
    const out = injectManifestIntoHtml(TEMPLATE, {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"metaBoxes":[],"settingsGroups":[]}`,
    );
    expect(out).not.toContain(
      `{"entryTypes":[],"taxonomies":[],"metaBoxes":[],"settingsGroups":[]}`,
    );
  });

  test("is idempotent when the manifest is already injected", () => {
    const manifest = {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    };
    const once = injectManifestIntoHtml(TEMPLATE, manifest);
    const twice = injectManifestIntoHtml(once, manifest);
    expect(twice).toBe(once);
  });

  test("throws when the placeholder tag is missing", () => {
    expect(() =>
      injectManifestIntoHtml("<!doctype html><html></html>", emptyManifest()),
    ).toThrow(/placeholder/);
  });

  test("preserves surrounding script tags", () => {
    const out = injectManifestIntoHtml(TEMPLATE, emptyManifest());
    expect(out).toContain(`<script type="module" src="/src/main.tsx">`);
    expect(out).toContain(`<div id="root"></div>`);
  });

  test("matches uppercase SCRIPT tags (minifier-agnostic)", () => {
    const html = `<SCRIPT ID="plumix-manifest" TYPE="application/json">{"entryTypes":[]}</SCRIPT>`;
    const out = injectManifestIntoHtml(html, {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"metaBoxes":[],"settingsGroups":[]}`,
    );
  });

  test("tolerates whitespace inside the placeholder body", () => {
    const html = `<script id="plumix-manifest" type="application/json">
      { "entryTypes": [] }
    </script>`;
    const out = injectManifestIntoHtml(html, {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(out).toMatch(
      /^<script id="plumix-manifest" type="application\/json">\{"entryTypes":\[\{"name":"post","adminSlug":"posts","label":"Posts"\}\],"taxonomies":\[\],"metaBoxes":\[\],"settingsGroups":\[\]\}<\/script>$/,
    );
  });
});
