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

  test("projects registered settings groups, fields use the shared MetaBoxField shape", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        description: "Public-facing site identity.",
        fields: [
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
            default: "My Site",
          },
          {
            key: "site_description",
            label: "Tagline",
            type: "string",
            inputType: "textarea",
          },
        ],
      });
    });
    const { registry } = await installPlugins({
      hooks,
      plugins: [corePlugin],
    });
    const manifest = buildManifest(registry);
    expect(manifest.settingsGroups).toHaveLength(1);
    expect(manifest.settingsGroups[0]).toMatchObject({
      name: "identity",
      label: "Site identity",
      description: "Public-facing site identity.",
      fields: [
        {
          key: "site_title",
          label: "Site title",
          type: "string",
          inputType: "text",
          default: "My Site",
        },
        {
          key: "site_description",
          label: "Tagline",
          type: "string",
          inputType: "textarea",
        },
      ],
    });
    // `registeredBy` is server-only and must not leak to the manifest.
    const projected = manifest.settingsGroups[0] as unknown as Record<
      string,
      unknown
    >;
    expect(projected.registeredBy).toBeUndefined();
  });

  test("settings page composes registered groups by name, sorted by priority", async () => {
    const hooks = new HookRegistry();
    const corePlugin = definePlugin("core", (ctx) => {
      ctx.registerSettingsGroup("identity", {
        label: "Site identity",
        fields: [
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
          },
        ],
      });
      ctx.registerSettingsGroup("reading", {
        label: "Reading",
        fields: [
          {
            key: "per_page",
            label: "Posts per page",
            type: "string",
            inputType: "text",
          },
        ],
      });
      ctx.registerSettingsPage("general", {
        label: "General",
        description: "Basic site settings.",
        groups: ["identity", "reading"],
        priority: 10,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [corePlugin] });
    const manifest = buildManifest(registry);
    expect(manifest.settingsPages).toEqual([
      {
        name: "general",
        label: "General",
        description: "Basic site settings.",
        groups: ["identity", "reading"],
        priority: 10,
      },
    ]);
  });

  test("buildManifest throws when a page references an unregistered group", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("orphan", (ctx) => {
      ctx.registerSettingsPage("general", {
        label: "General",
        groups: ["nonexistent"],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /Settings page "general" references group "nonexistent"/,
    );
  });

  test("rejects duplicate settings group registration", async () => {
    const hooks = new HookRegistry();
    const pluginA = definePlugin("a", (ctx) => {
      ctx.registerSettingsGroup("general", { label: "General", fields: [] });
    });
    const pluginB = definePlugin("b", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "Also General",
        fields: [],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [pluginA, pluginB] }),
    ).rejects.toThrow(/settings group "general"/);
  });

  test("rejects duplicate settings page registration", async () => {
    const hooks = new HookRegistry();
    const pluginA = definePlugin("a", (ctx) => {
      ctx.registerSettingsPage("general", { label: "General", groups: [] });
    });
    const pluginB = definePlugin("b", (ctx) => {
      ctx.registerSettingsPage("general", {
        label: "Also General",
        groups: [],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [pluginA, pluginB] }),
    ).rejects.toThrow(/settings page "general"/);
  });

  test("rejects a settings page that lists the same group twice", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe", (ctx) => {
      ctx.registerSettingsGroup("identity", { label: "Identity", fields: [] });
      ctx.registerSettingsPage("general", {
        label: "General",
        groups: ["identity", "identity"],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /lists a group more than once/,
    );
  });

  test("rejects invalid group / page names (must be snake_case ASCII)", async () => {
    const hooks = new HookRegistry();
    const badGroup = definePlugin("a", (ctx) => {
      ctx.registerSettingsGroup("Foo-Bar", { label: "x", fields: [] });
    });
    await expect(
      installPlugins({ hooks, plugins: [badGroup] }),
    ).rejects.toThrow(/Invalid settings group name "Foo-Bar"/);

    const badPage = definePlugin("c", (ctx) => {
      ctx.registerSettingsPage("Bad-Page", { label: "x", groups: [] });
    });
    await expect(
      installPlugins({ hooks: new HookRegistry(), plugins: [badPage] }),
    ).rejects.toThrow(/Invalid settings page name "Bad-Page"/);
  });

  test("rejects a settings group field with an invalid key (shared meta regex)", async () => {
    const hooks = new HookRegistry();
    const badField = definePlugin("b", (ctx) => {
      ctx.registerSettingsGroup("good", {
        label: "x",
        fields: [
          { key: "bad key!", label: "X", type: "string", inputType: "text" },
        ],
      });
    });
    await expect(
      installPlugins({ hooks, plugins: [badField] }),
    ).rejects.toThrow(/invalid key "bad key!"/);
  });

  test("rejects a group that exceeds the 200-field cap", async () => {
    const hooks = new HookRegistry();
    const tooMany = definePlugin("big", (ctx) => {
      ctx.registerSettingsGroup("big", {
        label: "x",
        fields: Array.from({ length: 201 }, (_, i) => ({
          key: `f${i}`,
          label: `Field ${i}`,
          type: "string" as const,
          inputType: "text",
        })),
      });
    });
    await expect(installPlugins({ hooks, plugins: [tooMany] })).rejects.toThrow(
      /declares 201 fields; the admin caps a single box at 200/,
    );
  });

  test("rejects a field key that collides within a group", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe", (ctx) => {
      ctx.registerSettingsGroup("general", {
        label: "General",
        fields: [
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
          },
          {
            key: "site_title",
            label: "Dup",
            type: "string",
            inputType: "text",
          },
        ],
      });
    });
    await expect(installPlugins({ hooks, plugins: [plugin] })).rejects.toThrow(
      /declares field "site_title" more than once/,
    );
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

  test("orders post types by priority, unspecified last", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("mixed", (ctx) => {
      ctx.registerEntryType("late", { label: "Late", priority: 50 });
      ctx.registerEntryType("unpositioned", { label: "Unpositioned" });
      ctx.registerEntryType("early", { label: "Early", priority: 5 });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const names = buildManifest(registry).entryTypes.map((pt) => pt.name);
    expect(names).toEqual(["early", "late", "unpositioned"]);
  });

  test("entry types with the same priority break ties by name alphabetical", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("mixed", (ctx) => {
      ctx.registerEntryType("zebra", { label: "Zebra", priority: 0 });
      ctx.registerEntryType("alpha", { label: "Alpha", priority: 0 });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const names = buildManifest(registry).entryTypes.map((pt) => pt.name);
    expect(names).toEqual(["alpha", "zebra"]);
  });

  test("settings pages with the same priority break ties by name alphabetical", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("mixed", (ctx) => {
      ctx.registerSettingsPage("zebra", {
        label: "Zebra",
        groups: [],
        priority: 0,
      });
      ctx.registerSettingsPage("alpha", {
        label: "Alpha",
        groups: [],
        priority: 0,
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const names = buildManifest(registry).settingsPages.map((p) => p.name);
    expect(names).toEqual(["alpha", "zebra"]);
  });

  test("projects registered entry meta boxes, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryMetaBox("seo-meta", {
        label: "SEO",
        description: "Meta title + description for search snippets.",
        location: "sidebar",
        priority: 0,
        entryTypes: ["post"],
        capability: "post:edit_any",
        fields: [
          {
            key: "title",
            label: "Meta title",
            type: "string",
            inputType: "text",
            maxLength: 60,
          },
          {
            key: "desc",
            label: "Meta description",
            type: "string",
            inputType: "textarea",
          },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const manifest = buildManifest(registry);
    expect(manifest.entryMetaBoxes).toHaveLength(1);
    const [box] = manifest.entryMetaBoxes;
    expect(box).toMatchObject({
      id: "seo-meta",
      label: "SEO",
      description: "Meta title + description for search snippets.",
      location: "sidebar",
      priority: 0,
      entryTypes: ["post"],
      capability: "post:edit_any",
    });
    expect(box?.fields).toEqual([
      {
        key: "title",
        label: "Meta title",
        type: "string",
        inputType: "text",
        description: undefined,
        required: undefined,
        placeholder: undefined,
        maxLength: 60,
        min: undefined,
        max: undefined,
        step: undefined,
        options: undefined,
        default: undefined,
      },
      {
        key: "desc",
        label: "Meta description",
        type: "string",
        inputType: "textarea",
        description: undefined,
        required: undefined,
        placeholder: undefined,
        maxLength: undefined,
        min: undefined,
        max: undefined,
        step: undefined,
        options: undefined,
        default: undefined,
      },
    ]);
    const entry = box as unknown as Record<string, unknown>;
    expect(entry.registeredBy).toBeUndefined();
  });

  test("projects registered term meta boxes, keyed by taxonomy", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("branding", (ctx) => {
      ctx.registerTaxonomy("category", { label: "Categories" });
      ctx.registerTermMetaBox("category-branding", {
        label: "Branding",
        description: "Optional icon + accent colour.",
        taxonomies: ["category"],
        fields: [
          {
            key: "icon_url",
            label: "Icon URL",
            type: "string",
            inputType: "url",
          },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const manifest = buildManifest(registry);
    expect(manifest.termMetaBoxes).toHaveLength(1);
    expect(manifest.termMetaBoxes[0]).toMatchObject({
      id: "category-branding",
      label: "Branding",
      taxonomies: ["category"],
    });
  });

  test("rejects two entry boxes declaring the same field key on the same entry type", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
      ctx.registerEntryMetaBox("box-a", {
        label: "A",
        entryTypes: ["post"],
        fields: [
          { key: "title", label: "Title", type: "string", inputType: "text" },
        ],
      });
      ctx.registerEntryMetaBox("box-b", {
        label: "B",
        entryTypes: ["post"],
        fields: [
          { key: "title", label: "Title", type: "string", inputType: "text" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /Meta field "title" is declared by entry meta boxes "box-a" and "box-b" on the same scope "post"/,
    );
  });

  test("rejects two term boxes declaring the same field key on the same taxonomy", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe-term", (ctx) => {
      ctx.registerTaxonomy("category", { label: "Categories" });
      ctx.registerTermMetaBox("t-a", {
        label: "A",
        taxonomies: ["category"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
        ],
      });
      ctx.registerTermMetaBox("t-b", {
        label: "B",
        taxonomies: ["category"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /Meta field "icon" is declared by term meta boxes "t-a" and "t-b" on the same scope "category"/,
    );
  });

  test("rejects a term meta box scoped to an unregistered taxonomy", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("unknown-scope", (ctx) => {
      // No `registerTaxonomy("catagory")` — the typo below is dead code.
      ctx.registerTermMetaBox("branding", {
        label: "Branding",
        taxonomies: ["catagory"],
        fields: [
          { key: "icon", label: "Icon", type: "string", inputType: "text" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /term meta box "branding" references taxonomy "catagory" which hasn't been registered/,
    );
  });

  test("rejects an entry meta box scoped to an unregistered entry type", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("unknown-scope", (ctx) => {
      ctx.registerEntryMetaBox("seo", {
        label: "SEO",
        entryTypes: ["pots"],
        fields: [{ key: "og", label: "OG", type: "string", inputType: "text" }],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /entry meta box "seo" references entry type "pots" which hasn't been registered/,
    );
  });

  test("rejects two user meta boxes declaring the same field key", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("dupe-user", (ctx) => {
      ctx.registerUserMetaBox("u-a", {
        label: "A",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        ],
      });
      ctx.registerUserMetaBox("u-b", {
        label: "B",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(
      /Meta field "bio" is declared by user meta boxes "u-a" and "u-b" on the same scope "user"/,
    );
  });

  test("projects a registered user meta box into the manifest", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("profile", (ctx) => {
      ctx.registerUserMetaBox("profile", {
        label: "Profile",
        description: "Author bio + socials.",
        fields: [
          { key: "bio", label: "Bio", type: "string", inputType: "textarea" },
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const manifest = buildManifest(registry);
    expect(manifest.userMetaBoxes).toHaveLength(1);
    expect(manifest.userMetaBoxes[0]).toMatchObject({
      id: "profile",
      label: "Profile",
      description: "Author bio + socials.",
    });
  });

  test("empty meta-box registry yields empty entry + term + user meta box arrays", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", { label: "Posts" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const manifest = buildManifest(registry);
    expect(manifest.entryMetaBoxes).toEqual([]);
    expect(manifest.termMetaBoxes).toEqual([]);
    expect(manifest.userMetaBoxes).toEqual([]);
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
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(tag).toContain(`id="${MANIFEST_SCRIPT_ID}"`);
    expect(tag).toContain(`type="application/json"`);
    expect(tag).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"entryMetaBoxes":[],"termMetaBoxes":[],"userMetaBoxes":[],"settingsGroups":[],"settingsPages":[]}`,
    );
  });

  test("neutralises </ sequences in payload so the tag can't be broken out of", () => {
    const tag = serializeManifestScript({
      entryTypes: [
        { name: "post", adminSlug: "posts", label: "</script><b>x</b>" },
      ],
      taxonomies: [],
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(tag).not.toContain("</script><b>");
    expect(tag).toMatch(/<\\\/script>/);
  });

  test("round-trips through JSON.parse after unescaping the slash", () => {
    const manifest = {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "x</y>" }],
      taxonomies: [],
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
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
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"entryMetaBoxes":[],"termMetaBoxes":[],"userMetaBoxes":[],"settingsGroups":[],"settingsPages":[]}`,
    );
    expect(out).not.toContain(
      `{"entryTypes":[],"taxonomies":[],"entryMetaBoxes":[],"termMetaBoxes":[],"userMetaBoxes":[],"settingsGroups":[],"settingsPages":[]}`,
    );
  });

  test("is idempotent when the manifest is already injected", () => {
    const manifest = {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
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
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(out).toContain(
      `{"entryTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"taxonomies":[],"entryMetaBoxes":[],"termMetaBoxes":[],"userMetaBoxes":[],"settingsGroups":[],"settingsPages":[]}`,
    );
  });

  test("tolerates whitespace inside the placeholder body", () => {
    const html = `<script id="plumix-manifest" type="application/json">
      { "entryTypes": [] }
    </script>`;
    const out = injectManifestIntoHtml(html, {
      entryTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      taxonomies: [],
      entryMetaBoxes: [],
      termMetaBoxes: [],
      userMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(out).toMatch(
      /^<script id="plumix-manifest" type="application\/json">\{"entryTypes":\[\{"name":"post","adminSlug":"posts","label":"Posts"\}\],"taxonomies":\[\],"entryMetaBoxes":\[\],"termMetaBoxes":\[\],"userMetaBoxes":\[\],"settingsGroups":\[\],"settingsPages":\[\]}<\/script>$/,
    );
  });
});
