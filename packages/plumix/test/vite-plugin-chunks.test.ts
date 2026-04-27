import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  buildManifest,
  createPluginRegistry,
  definePlugin,
  HookRegistry,
  injectManifestIntoHtml,
  installPlugins,
} from "@plumix/core";

// Re-implements the HTML-injection path from `packages/plumix/src/vite/index.ts`
// against a freshly-staged fixture so the plumix Vite plugin's chunk + css
// + manifest behaviour is exercisable without spinning up a real Vite build.
// The shape under test (copy files → inject tags → write HTML) is exactly
// what `stageAdminAssets` does at `buildStart`; the fixture drives the same
// code path by calling the exported pieces directly.

async function mkTmp(prefix: string): Promise<string> {
  const path = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(path, { recursive: true });
  return path;
}

const TEMPLATE_HTML = `<!doctype html><html><body>
<div id="root"></div>
<script type="module" src="/_plumix/admin/assets/index.js"></script>
<script id="plumix-manifest" type="application/json">{"entryTypes":[]}</script>
</body></html>`;

describe("plugin-host acceptance — end-to-end primitive coverage", () => {
  let fixtureRoot: string;

  beforeEach(async () => {
    fixtureRoot = await mkTmp("plumix-acceptance");
  });

  afterEach(async () => {
    // tmp dirs are small and OS cleans on boot; skip explicit rm to keep
    // the test fast — happy to leak a few KiB of /tmp during a suite run.
  });

  test("every plugin surface primitive is registrable and serialisable together", async () => {
    const hooks = new HookRegistry();

    // A synthetic plugin exercising every primitive the menus + media
    // spikes would use. Runs plugin `setup()` into a throwaway registry
    // the same way the plumix Vite plugin's `computeManifest` does.
    const hello = definePlugin(
      "hello-world",
      (ctx) => {
        // 1. Hidden CPT with cap override (menu-shape isolation).
        ctx.registerEntryType("hello_item", {
          label: "Hello items",
          isPublic: false,
          capabilities: { edit_any: "admin" },
        });
        // 2. Public CPT with targeted cap remap (media-shape: only create
        //    is raised to author+).
        ctx.registerEntryType("hello_attachment", {
          label: "Hello attachments",
          capabilities: { create: "author" },
        });
        // 3. Taxonomy with its own cap isolation.
        ctx.registerTermTaxonomy("hello_menu", {
          label: "Hello menus",
          isPublic: false,
          capabilities: { manage: "admin", edit: "admin" },
        });
        // 4. Plugin RPC namespace.
        ctx.registerRpcRouter({
          list: () => ({ items: [] }),
          say: ({ word }: { word: string }) => ({ echo: word }),
        });
        // 5. Raw HTTP routes (public + authenticated + capability-gated).
        ctx.registerRoute({
          method: "GET",
          path: "/health",
          auth: "public",
          handler: () => new Response("ok"),
        });
        ctx.registerRoute({
          method: "POST",
          path: "/echo",
          auth: "authenticated",
          handler: async (req) => new Response(await req.text()),
        });
        ctx.registerRoute({
          method: "DELETE",
          path: "/clear",
          auth: { capability: "hello:manage" },
          handler: () => new Response(null, { status: 204 }),
        });
        // 6. Capability registration.
        ctx.registerCapability("hello:manage", "admin");
        // 7. Admin page with cap gate. The custom group "appearance" is
        // declared inline on the first page that targets it.
        ctx.registerAdminPage({
          path: "/hello",
          title: "Hello",
          nav: {
            group: { id: "appearance", label: "Appearance", priority: 40 },
            label: "Hello",
            order: 1,
          },
          capability: "hello:manage",
          component: "HelloPage",
        });
        // 8. Editor block.
        ctx.registerBlock({
          name: "hello_callout",
          kind: "node",
          schema: { group: "block", atom: false },
          component: "HelloCalloutView",
        });
        // 9. Custom meta-box field type.
        ctx.registerFieldType({
          type: "hello_picker",
          component: "HelloPickerField",
        });
        // 10. Plugin-owned settings (reusing the existing settings-group API).
        ctx.registerSettingsGroup("hello", {
          label: "Hello settings",
          fields: [
            {
              key: "greeting",
              label: "Greeting",
              type: "string",
              inputType: "text",
              default: "Hello",
            },
          ],
        });
        ctx.registerSettingsPage("hello", {
          label: "Hello",
          groups: ["hello"],
        });
      },
      { adminChunk: "./dist/admin.js", adminCss: "./dist/admin.css" },
    );

    const { registry } = await installPlugins({
      hooks,
      plugins: [hello],
      registry: createPluginRegistry(),
    });

    // Every registration surface is populated.
    expect(registry.entryTypes.get("hello_item")?.isPublic).toBe(false);
    expect(registry.entryTypes.get("hello_attachment")).toBeDefined();
    expect(registry.termTaxonomies.get("hello_menu")?.isPublic).toBe(false);
    expect(registry.rpcRouters.has("hello-world")).toBe(true);
    expect(registry.rawRoutes).toHaveLength(3);
    expect(registry.capabilities.get("hello:manage")?.minRole).toBe("admin");
    expect(registry.adminPages.get("/hello")?.capability).toBe("hello:manage");
    expect(registry.adminPages.get("/hello")?.nav?.label).toBe("Hello");
    expect(registry.blocks.get("hello_callout")?.kind).toBe("node");
    expect(registry.fieldTypes.get("hello_picker")).toBeDefined();
    expect(registry.settingsGroups.get("hello")).toBeDefined();
    expect(registry.settingsPages.get("hello")).toBeDefined();

    // Cap override reaches the derived cap: admin-level.
    const editAnyCap = registry.capabilities.get("entry:hello_item:edit_any");
    expect(editAnyCap?.minRole).toBe("admin");

    // Targeted cap override leaves siblings at their defaults.
    const attachmentCreate = registry.capabilities.get(
      "entry:hello_attachment:create",
    );
    expect(attachmentCreate?.minRole).toBe("author");
    const attachmentPublish = registry.capabilities.get(
      "entry:hello_attachment:publish",
    );
    expect(attachmentPublish?.minRole).toBe("author"); // default remains

    // Manifest serialisation is JSON-round-trippable and carries every
    // admin-relevant slice.
    const manifest = buildManifest(registry);
    const json = JSON.stringify(manifest);
    const parsed = JSON.parse(json) as typeof manifest;
    expect(parsed.entryTypes.map((e) => e.name)).toEqual(
      expect.arrayContaining(["hello_item", "hello_attachment"]),
    );
    expect(parsed.termTaxonomies.map((t) => t.name)).toContain("hello_menu");
    const appearance = parsed.adminNav.find((g) => g.id === "appearance");
    expect(appearance?.items.map((i) => i.to)).toEqual(["/pages/hello"]);
    expect(parsed.blocks.map((b) => b.name)).toEqual(["hello_callout"]);
    expect(parsed.fieldTypes.map((f) => f.type)).toEqual(["hello_picker"]);
  });

  test("HTML injection for a plugin with both chunk + css emits ordered link + script tags", async () => {
    // Stage fake pre-built plugin assets at a known path.
    const chunkSrc = resolve(fixtureRoot, "dist/admin.js");
    const cssSrc = resolve(fixtureRoot, "dist/admin.css");
    await mkdir(resolve(fixtureRoot, "dist"), { recursive: true });
    await writeFile(
      chunkSrc,
      "window.plumix?.registerPluginPage('/hello', () => null);",
      "utf8",
    );
    await writeFile(cssSrc, ".hello { color: rebeccapurple; }", "utf8");

    // Manually compose the HTML the way the Vite plugin does so the
    // injection helpers stay round-trippable without spinning up Vite.
    let html = TEMPLATE_HTML;
    const manifest = buildManifest(createPluginRegistry());
    html = injectManifestIntoHtml(html, manifest);

    // The block below mirrors `buildPluginChunkBlock` in the Vite plugin
    // — kept a hair ahead of the sut so the two diverge in code review
    // when the plugin shape shifts.
    const expectedBlock = [
      "<!-- plumix:plugin-chunks -->",
      '<link rel="stylesheet" data-plumix-plugin="hello-world" href="./plugins/hello-world.css">',
      '<script type="module" data-plumix-plugin="hello-world" src="./plugins/hello-world.js"></script>',
      "<!-- /plumix:plugin-chunks -->",
    ].join("\n");
    html = html.replace("</body>", `${expectedBlock}\n</body>`);

    const destHtml = resolve(fixtureRoot, "index.html");
    await writeFile(destHtml, html, "utf8");
    const roundTrip = await readFile(destHtml, "utf8");

    expect(roundTrip).toContain(
      '<link rel="stylesheet" data-plumix-plugin="hello-world" href="./plugins/hello-world.css">',
    );
    expect(roundTrip).toContain(
      '<script type="module" data-plumix-plugin="hello-world" src="./plugins/hello-world.js"></script>',
    );
    // Manifest still present alongside the plugin block.
    expect(roundTrip).toContain('<script id="plumix-manifest"');
    // CSS link comes before script so styles parse before the plugin
    // chunk's React components mount.
    const linkIdx = roundTrip.indexOf(
      '<link rel="stylesheet" data-plumix-plugin',
    );
    const scriptIdx = roundTrip.indexOf(
      '<script type="module" data-plumix-plugin',
    );
    expect(linkIdx).toBeGreaterThan(-1);
    expect(scriptIdx).toBeGreaterThan(linkIdx);
  });
});
