import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadRegistry } from "./registry.js";

describe("loadRegistry", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "plumix-registry-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeRuntimePackage(dir: string, scaffold: unknown): void {
    const pkgDir = join(root, "packages", "runtimes", dir);
    mkdirSync(join(pkgDir, "scaffold"), { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: `@plumix/runtime-${dir}`, plumix: { scaffold } }),
    );
    writeFileSync(
      join(pkgDir, "scaffold", "wrangler.jsonc"),
      '{ "name": "__PROJECT_NAME__" }\n',
    );
  }

  function writePluginPackage(
    dir: string,
    scaffold: unknown,
    extra: Record<string, unknown> = {},
  ): void {
    const pkgDir = join(root, "packages", "plugins", dir);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: `@plumix/plugin-${dir}`,
        version: "0.1.0",
        plumix: { scaffold },
        ...extra,
      }),
    );
  }

  it("builds a runtime descriptor from a package's plumix.scaffold block", async () => {
    writeRuntimePackage("cloudflare", {
      kind: "runtime",
      id: "cloudflare",
      label: "Cloudflare",
      imports: ['import { cloudflare } from "@plumix/runtime-cloudflare";'],
      configSlots: { runtime: "cloudflare()" },
      deps: { "@plumix/runtime-cloudflare": "workspace:*" },
      devDeps: { wrangler: "catalog:cloudflare" },
      files: { "wrangler.jsonc": "scaffold/wrangler.jsonc" },
    });

    const registry = await loadRegistry(root);

    expect(registry.runtimes).toHaveLength(1);
    const [runtime] = registry.runtimes;
    expect(runtime).toMatchObject({
      id: "cloudflare",
      label: "Cloudflare",
      configSlots: { runtime: "cloudflare()" },
      deps: { "@plumix/runtime-cloudflare": "workspace:*" },
    });
  });

  it("reads referenced files into the descriptor as content", async () => {
    writeRuntimePackage("cloudflare", {
      kind: "runtime",
      id: "cloudflare",
      label: "Cloudflare",
      files: { "wrangler.jsonc": "scaffold/wrangler.jsonc" },
    });

    const registry = await loadRegistry(root);

    expect(registry.runtimes[0]?.files["wrangler.jsonc"]).toBe(
      '{ "name": "__PROJECT_NAME__" }\n',
    );
  });

  it("builds a plugin descriptor and derives deps from the package + peers", async () => {
    writePluginPackage(
      "comments",
      {
        kind: "plugin",
        id: "comments",
        label: "Comments",
        registration: 'comments({ entryTypes: ["post"] })',
        imports: ['import { comments } from "@plumix/plugin-comments";'],
      },
      {
        peerDependencies: {
          plumix: "workspace:^",
          "@tanstack/react-query": "catalog:tanstack",
        },
      },
    );

    const registry = await loadRegistry(root);

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]).toMatchObject({
      id: "comments",
      registration: 'comments({ entryTypes: ["post"] })',
      deps: {
        "@plumix/plugin-comments": "workspace:*",
        plumix: "workspace:^",
        "@tanstack/react-query": "catalog:tanstack",
      },
    });
  });

  it("carries a plugin's required capabilities through", async () => {
    writePluginPackage("media", {
      kind: "plugin",
      label: "Media",
      registration: "media()",
      requires: ["storage", "imageDelivery"],
    });

    const registry = await loadRegistry(root);

    expect(registry.plugins[0]?.requires).toEqual(["storage", "imageDelivery"]);
  });

  it("rejects a plugin scaffold block missing a registration", async () => {
    writePluginPackage("broken", { kind: "plugin", label: "Broken" });

    await expect(loadRegistry(root)).rejects.toThrow(/missing "registration"/i);
  });

  it("ignores runtime packages without a scaffold block", async () => {
    const pkgDir = join(root, "packages", "runtimes", "internal");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@plumix/runtime-internal" }),
    );

    const registry = await loadRegistry(root);

    expect(registry.runtimes).toEqual([]);
  });
});
