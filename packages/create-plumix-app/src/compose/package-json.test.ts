import { describe, expect, it } from "vitest";

import type { CatalogContext } from "../catalog.js";
import type { RuntimeDescriptor, Selection } from "./types.js";
import { assemblePackageJson } from "./package-json.js";

const BASE_PACKAGE_JSON = {
  name: "__PROJECT_NAME__",
  version: "0.0.0",
  private: true,
  type: "module",
  scripts: { build: "plumix build", dev: "plumix dev" },
  dependencies: { plumix: "workspace:*", react: "catalog:react" },
  devDependencies: {
    "@types/node": "catalog:",
    "@types/react": "catalog:react",
    typescript: "catalog:",
  },
};

const cloudflareRuntime: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: [],
  configSlots: {},
  deps: { "@plumix/runtime-cloudflare": "workspace:*" },
  devDeps: {
    "@cloudflare/workers-types": "catalog:cloudflare",
    wrangler: "catalog:cloudflare",
  },
  files: {},
};

const ctx: CatalogContext = {
  catalog: { "@types/node": "^22.0.0", typescript: "^5.6.0" },
  catalogs: {
    react: { react: "^19.2.7", "@types/react": "^19.0.0" },
    cloudflare: { "@cloudflare/workers-types": "^4.0.0", wrangler: "^4.111.0" },
    tanstack: { "@tanstack/react-query": "^5.101.2" },
  },
  workspaceVersions: {
    plumix: "0.1.0",
    "@plumix/runtime-cloudflare": "0.2.1",
    "@plumix/plugin-media": "0.1.0",
  },
};

const selection: Selection = {
  projectName: "my-app",
  runtime: cloudflareRuntime,
  plugins: [],
};

function parse(json: string): {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(json) as ReturnType<typeof parse>;
}

describe("assemblePackageJson — blank Cloudflare app", () => {
  it("sets the project name", () => {
    const pkg = parse(assemblePackageJson(selection, BASE_PACKAGE_JSON, ctx));
    expect(pkg.name).toBe("my-app");
  });

  it("merges runtime deps with base deps and resolves protocols to versions", () => {
    const pkg = parse(assemblePackageJson(selection, BASE_PACKAGE_JSON, ctx));
    expect(pkg.dependencies).toEqual({
      "@plumix/runtime-cloudflare": "^0.2.1",
      plumix: "^0.1.0",
      react: "^19.2.7",
    });
    expect(pkg.devDependencies).toEqual({
      "@cloudflare/workers-types": "^4.0.0",
      "@types/node": "^22.0.0",
      "@types/react": "^19.0.0",
      typescript: "^5.6.0",
      wrangler: "^4.111.0",
    });
  });

  it("adds selected plugins' derived deps, resolved and deduped", () => {
    const withMedia: Selection = {
      ...selection,
      plugins: [
        {
          id: "media",
          label: "Media",
          registration: "media()",
          imports: [],
          deps: {
            "@plumix/plugin-media": "workspace:*",
            "@tanstack/react-query": "catalog:tanstack",
            react: "catalog:react",
          },
        },
      ],
    };
    const pkg = parse(assemblePackageJson(withMedia, BASE_PACKAGE_JSON, ctx));
    expect(pkg.dependencies).toMatchObject({
      "@plumix/plugin-media": "^0.1.0",
      "@tanstack/react-query": "^5.101.2",
      react: "^19.2.7",
    });
  });

  it("emits 2-space JSON with a trailing newline", () => {
    const out = assemblePackageJson(selection, BASE_PACKAGE_JSON, ctx);
    expect(out.endsWith("}\n")).toBe(true);
    expect(out).toContain('\n  "name": "my-app"');
  });
});
