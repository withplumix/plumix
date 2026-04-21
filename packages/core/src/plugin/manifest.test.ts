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

  test("projects registered post types, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const blog = definePlugin("blog", (ctx) => {
      ctx.registerPostType("post", {
        label: "Posts",
        labels: { singular: "Post" },
        supports: ["title", "editor"],
        taxonomies: ["category"],
        rewrite: { slug: "posts" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [blog] });

    const manifest = buildManifest(registry);

    expect(manifest.postTypes).toEqual([
      {
        name: "post",
        adminSlug: "posts",
        label: "Posts",
        labels: { singular: "Post" },
        supports: ["title", "editor"],
        taxonomies: ["category"],
      },
    ]);
    const entry = manifest.postTypes[0] as unknown as Record<string, unknown>;
    expect(entry.registeredBy).toBeUndefined();
    expect(entry.rewrite).toBeUndefined();
  });

  test("uses labels.plural (slugified) for adminSlug when provided", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("shop", (ctx) => {
      ctx.registerPostType("product", {
        label: "Product",
        labels: { singular: "Product", plural: "Product Catalog" },
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(buildManifest(registry).postTypes[0]?.adminSlug).toBe(
      "product-catalog",
    );
  });

  test("falls back to `${name}s` when labels.plural is not set", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("shop", (ctx) => {
      ctx.registerPostType("product", { label: "Product" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(buildManifest(registry).postTypes[0]?.adminSlug).toBe("products");
  });

  test("throws DuplicateAdminSlugError when two types resolve to the same slug", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("clash", (ctx) => {
      ctx.registerPostType("product", {
        label: "Products",
        labels: { plural: "Items" },
      });
      ctx.registerPostType("item", { label: "Items" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    expect(() => buildManifest(registry)).toThrow(DuplicateAdminSlugError);
  });

  test("orders post types by menuPosition, unspecified last", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("mixed", (ctx) => {
      ctx.registerPostType("late", { label: "Late", menuPosition: 50 });
      ctx.registerPostType("unpositioned", { label: "Unpositioned" });
      ctx.registerPostType("early", { label: "Early", menuPosition: 5 });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    const names = buildManifest(registry).postTypes.map((pt) => pt.name);
    expect(names).toEqual(["early", "late", "unpositioned"]);
  });

  test("projects registered meta boxes, dropping server-only fields", async () => {
    const hooks = new HookRegistry();
    const plugin = definePlugin("seo", (ctx) => {
      ctx.registerPostType("post", { label: "Posts" });
      ctx.registerMetaBox("seo-meta", {
        label: "SEO",
        context: "side",
        priority: "high",
        postTypes: ["post"],
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
        postTypes: ["post"],
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
      ctx.registerPostType("post", { label: "Posts" });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });

    expect(buildManifest(registry).metaBoxes).toEqual([]);
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
      postTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      metaBoxes: [],
    });
    expect(tag).toContain(`id="${MANIFEST_SCRIPT_ID}"`);
    expect(tag).toContain(`type="application/json"`);
    expect(tag).toContain(
      `{"postTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"metaBoxes":[]}`,
    );
  });

  test("neutralises </ sequences in payload so the tag can't be broken out of", () => {
    const tag = serializeManifestScript({
      postTypes: [
        { name: "post", adminSlug: "posts", label: "</script><b>x</b>" },
      ],
      metaBoxes: [],
    });
    expect(tag).not.toContain("</script><b>");
    expect(tag).toMatch(/<\\\/script>/);
  });

  test("round-trips through JSON.parse after unescaping the slash", () => {
    const manifest = {
      postTypes: [{ name: "post", adminSlug: "posts", label: "x</y>" }],
      metaBoxes: [],
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
<script id="plumix-manifest" type="application/json">{"postTypes":[]}</script>
<script type="module" src="/src/main.tsx"></script>
</body></html>`;

  test("replaces the placeholder with the serialised manifest", () => {
    const out = injectManifestIntoHtml(TEMPLATE, {
      postTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      metaBoxes: [],
    });
    expect(out).toContain(
      `{"postTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"metaBoxes":[]}`,
    );
    expect(out).not.toContain(`{"postTypes":[],"metaBoxes":[]}`);
  });

  test("is idempotent when the manifest is already injected", () => {
    const manifest = {
      postTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      metaBoxes: [],
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
    const html = `<SCRIPT ID="plumix-manifest" TYPE="application/json">{"postTypes":[]}</SCRIPT>`;
    const out = injectManifestIntoHtml(html, {
      postTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      metaBoxes: [],
    });
    expect(out).toContain(
      `{"postTypes":[{"name":"post","adminSlug":"posts","label":"Posts"}],"metaBoxes":[]}`,
    );
  });

  test("tolerates whitespace inside the placeholder body", () => {
    const html = `<script id="plumix-manifest" type="application/json">
      { "postTypes": [] }
    </script>`;
    const out = injectManifestIntoHtml(html, {
      postTypes: [{ name: "post", adminSlug: "posts", label: "Posts" }],
      metaBoxes: [],
    });
    expect(out).toMatch(
      /^<script id="plumix-manifest" type="application\/json">\{"postTypes":\[\{"name":"post","adminSlug":"posts","label":"Posts"\}\],"metaBoxes":\[\]\}<\/script>$/,
    );
  });
});
