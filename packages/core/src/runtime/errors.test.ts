import { describe, expect, test } from "vitest";

import { AppBootError } from "./errors.js";

describe("AppBootError.duplicateThemeId", () => {
  test("class identity, code, and exposed themeId", () => {
    const err = AppBootError.duplicateThemeId({ themeId: "blog" });
    expect(err).toBeInstanceOf(AppBootError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppBootError");
    expect(err.code).toBe("duplicate_theme_id");
    expect(err.themeId).toBe("blog");
  });

  test("message names the duplicated theme id", () => {
    const err = AppBootError.duplicateThemeId({ themeId: "blog" });
    expect(err.message).toContain('Theme id "blog" appears more than once');
  });
});

describe("AppBootError.schemaExportConflict", () => {
  test("class identity, code, and exposed plugin + schema + previous owner", () => {
    const err = AppBootError.schemaExportConflict({
      pluginId: "blog",
      schemaKey: "posts",
      previousOwner: "core",
    });
    expect(err).toBeInstanceOf(AppBootError);
    expect(err.name).toBe("AppBootError");
    expect(err.code).toBe("schema_export_conflict");
    expect(err.pluginId).toBe("blog");
    expect(err.schemaKey).toBe("posts");
    expect(err.previousOwner).toBe("core");
  });

  test("message names plugin, schema key, and previous owner", () => {
    const err = AppBootError.schemaExportConflict({
      pluginId: "blog",
      schemaKey: "posts",
      previousOwner: "core",
    });
    expect(err.message).toContain(
      'Plugin "blog" redefines schema export "posts"',
    );
    expect(err.message).toContain('already defined by "core"');
  });
});

describe("AppBootError.pluginIdCollidesWithCoreRpcNamespace", () => {
  test("class identity, code, and exposed pluginId", () => {
    const err = AppBootError.pluginIdCollidesWithCoreRpcNamespace({
      pluginId: "auth",
    });
    expect(err).toBeInstanceOf(AppBootError);
    expect(err.name).toBe("AppBootError");
    expect(err.code).toBe("plugin_id_collides_with_core_rpc_namespace");
    expect(err.pluginId).toBe("auth");
  });

  test("message names the plugin id and asks for a rename", () => {
    const err = AppBootError.pluginIdCollidesWithCoreRpcNamespace({
      pluginId: "auth",
    });
    expect(err.message).toContain(
      'Plugin id "auth" collides with a core RPC namespace',
    );
    expect(err.message).toContain("rename the plugin");
  });
});

describe("AppBootError.pluginIdCollidesWithCoreRpcRouter", () => {
  test("class identity, code, and exposed pluginId", () => {
    const err = AppBootError.pluginIdCollidesWithCoreRpcRouter({
      pluginId: "posts",
    });
    expect(err).toBeInstanceOf(AppBootError);
    expect(err.name).toBe("AppBootError");
    expect(err.code).toBe("plugin_id_collides_with_core_rpc_router");
    expect(err.pluginId).toBe("posts");
  });

  test("message names the plugin id and the core RPC router key", () => {
    const err = AppBootError.pluginIdCollidesWithCoreRpcRouter({
      pluginId: "posts",
    });
    expect(err.message).toContain(
      'Plugin id "posts" collides with the core RPC router key',
    );
    expect(err.message).toContain("rename the plugin");
  });
});
