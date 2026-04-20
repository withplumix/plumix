import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "./define.js";
import {
  buildManifest,
  createPluginRegistry,
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
});

describe("serializeManifestScript", () => {
  test("emits a json script tag with the expected id", () => {
    const tag = serializeManifestScript({
      postTypes: [{ name: "post", label: "Posts" }],
    });
    expect(tag).toContain(`id="${MANIFEST_SCRIPT_ID}"`);
    expect(tag).toContain(`type="application/json"`);
    expect(tag).toContain(`{"postTypes":[{"name":"post","label":"Posts"}]}`);
  });

  test("neutralises </ sequences in payload so the tag can't be broken out of", () => {
    const tag = serializeManifestScript({
      postTypes: [{ name: "post", label: "</script><b>x</b>" }],
    });
    expect(tag).not.toContain("</script><b>");
    expect(tag).toMatch(/<\\\/script>/);
  });

  test("round-trips through JSON.parse after unescaping the slash", () => {
    const manifest = { postTypes: [{ name: "post", label: "x</y>" }] };
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
      postTypes: [{ name: "post", label: "Posts" }],
    });
    expect(out).toContain(`{"postTypes":[{"name":"post","label":"Posts"}]}`);
    expect(out).not.toContain(`{"postTypes":[]}`);
  });

  test("is idempotent when the manifest is already injected", () => {
    const manifest = { postTypes: [{ name: "post", label: "Posts" }] };
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
      postTypes: [{ name: "post", label: "Posts" }],
    });
    expect(out).toContain(`{"postTypes":[{"name":"post","label":"Posts"}]}`);
  });

  test("tolerates whitespace inside the placeholder body", () => {
    const html = `<script id="plumix-manifest" type="application/json">
      { "postTypes": [] }
    </script>`;
    const out = injectManifestIntoHtml(html, {
      postTypes: [{ name: "post", label: "Posts" }],
    });
    expect(out).toMatch(
      /^<script id="plumix-manifest" type="application\/json">\{"postTypes":\[\{"name":"post","label":"Posts"\}\]\}<\/script>$/,
    );
  });
});
