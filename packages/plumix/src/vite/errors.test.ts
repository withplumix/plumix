import { describe, expect, test } from "vitest";

import { VitePluginError } from "./errors.js";

describe("VitePluginError.adminAssetNotFound", () => {
  test("class identity, code, exposed fields, and message", () => {
    const err = VitePluginError.adminAssetNotFound({
      pluginId: "blog",
      field: "adminCss",
      declared: "./dist/admin.css",
      resolved: "/abs/dist/admin.css",
    });
    expect(err).toBeInstanceOf(VitePluginError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("VitePluginError");
    expect(err.code).toBe("admin_asset_not_found");
    expect(err.pluginId).toBe("blog");
    expect(err.field).toBe("adminCss");
    expect(err.declared).toBe("./dist/admin.css");
    expect(err.resolved).toBe("/abs/dist/admin.css");
    expect(err.message).toContain(
      '[plumix] plugin "blog" declares adminCss "./dist/admin.css"',
    );
    expect(err.message).toContain(
      "the file was not found at /abs/dist/admin.css",
    );
  });
});

describe("VitePluginError.adminEntryAndChunkBothSet", () => {
  test("class identity, code, exposed pluginId, and message", () => {
    const err = VitePluginError.adminEntryAndChunkBothSet({ pluginId: "blog" });
    expect(err).toBeInstanceOf(VitePluginError);
    expect(err.name).toBe("VitePluginError");
    expect(err.code).toBe("admin_entry_and_chunk_both_set");
    expect(err.pluginId).toBe("blog");
    expect(err.message).toContain(
      '[plumix] plugin "blog" sets both adminEntry and adminChunk.',
    );
    expect(err.message).toContain("adminEntry (TS source) is preferred");
  });
});

describe("VitePluginError.adminEntryOutsideProjectRoot", () => {
  test("class identity, code, exposed fields, and message", () => {
    const err = VitePluginError.adminEntryOutsideProjectRoot({
      pluginId: "blog",
      adminEntry: "../outside.ts",
      resolved: "/abs/outside.ts",
    });
    expect(err.code).toBe("admin_entry_outside_project_root");
    expect(err.pluginId).toBe("blog");
    expect(err.adminEntry).toBe("../outside.ts");
    expect(err.resolved).toBe("/abs/outside.ts");
    expect(err.message).toContain(
      '[plumix] plugin "blog" adminEntry "../outside.ts"',
    );
    expect(err.message).toContain("resolves outside the project root");
    expect(err.message).toContain("/abs/outside.ts");
  });
});

describe("VitePluginError.adminEntryNotFound", () => {
  test("class identity, code, exposed fields, and message", () => {
    const err = VitePluginError.adminEntryNotFound({
      pluginId: "blog",
      adminEntry: "./src/admin.tsx",
      resolved: "/abs/src/admin.tsx",
    });
    expect(err.code).toBe("admin_entry_not_found");
    expect(err.adminEntry).toBe("./src/admin.tsx");
    expect(err.resolved).toBe("/abs/src/admin.tsx");
    expect(err.message).toContain(
      '[plumix] plugin "blog" declares adminEntry "./src/admin.tsx"',
    );
    expect(err.message).toContain(
      "the file was not found at /abs/src/admin.tsx",
    );
  });
});
