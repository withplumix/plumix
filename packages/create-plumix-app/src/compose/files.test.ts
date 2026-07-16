import { describe, expect, it } from "vitest";

import type { RuntimeDescriptor, Selection } from "./types.js";
import { assembleRuntimeFiles } from "./files.js";

const cloudflareRuntime: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: [],
  configSlots: {},
  deps: {},
  devDeps: {},
  files: {
    "wrangler.jsonc": `{
  "name": "__PROJECT_NAME__",
  "main": ".plumix/worker.ts",
  "d1_databases": [{ "binding": "DB", "database_name": "__PROJECT_NAME__" }]
}
`,
  },
};

const selection: Selection = {
  projectName: "my-app",
  runtime: cloudflareRuntime,
  plugins: [],
  authMethods: [],
};

describe("assembleRuntimeFiles", () => {
  it("substitutes the project name into runtime-contributed files", () => {
    const files = assembleRuntimeFiles(selection, {});
    const wrangler = files["wrangler.jsonc"];
    expect(wrangler).toContain('"name": "my-app"');
    expect(wrangler).toContain('"database_name": "my-app"');
    expect(wrangler).not.toContain("__PROJECT_NAME__");
  });

  it("returns every contributed file keyed by its relative path", () => {
    const files = assembleRuntimeFiles(selection, {});
    expect(Object.keys(files)).toEqual(["wrangler.jsonc"]);
  });

  it("throws if there are binding patches but no wrangler.jsonc to hold them", () => {
    const noWrangler: Selection = {
      ...selection,
      runtime: { ...cloudflareRuntime, files: {} },
    };
    expect(() =>
      assembleRuntimeFiles(noWrangler, { r2_buckets: [{ binding: "MEDIA" }] }),
    ).toThrow(/wrangler bindings but provides no wrangler.jsonc/i);
  });
});
