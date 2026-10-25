import type { MockInstance } from "vitest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";

import coreLingui from "../../lingui.config.js";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "./define.js";

const noop = (): void => undefined;

describe("definePlugin — schemaModule warning", () => {
  let warnSpy: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("warns when schema is set but schemaModule is missing", () => {
    definePlugin("test_plugin_schema_only", {
      setup: noop,
      schema: { someTable: {} },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain("test_plugin_schema_only");
    expect(message).toContain("schemaModule");
  });

  test("stays silent when both schema and schemaModule are set", () => {
    definePlugin("test_plugin_with_both", {
      setup: noop,
      schema: { someTable: {} },
      schemaModule: "@example/plugin/schema",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("stays silent when neither schema nor schemaModule is set", () => {
    definePlugin("test_plugin_neither", { setup: noop });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("warns only once when the same plugin id is defined repeatedly", () => {
    definePlugin("test_plugin_repeat", {
      setup: noop,
      schema: { someTable: {} },
    });
    definePlugin("test_plugin_repeat", {
      setup: noop,
      schema: { someTable: {} },
    });
    definePlugin("test_plugin_repeat", {
      setup: noop,
      schema: { someTable: {} },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("definePlugin — state", () => {
  test("types every hook's state from what the factory returns", () => {
    definePlugin("typed_state", {
      state: () => ({ registry: new Map<string, number>() }),
      provides: (_ctx, state) => {
        expectTypeOf(state).toEqualTypeOf<{ registry: Map<string, number> }>();
      },
      setup: (_ctx, state) => {
        expectTypeOf(state).toEqualTypeOf<{ registry: Map<string, number> }>();
      },
      afterSetup: (_ctx, state) => {
        expectTypeOf(state).toEqualTypeOf<{ registry: Map<string, number> }>();
      },
    });
  });

  test("types an async factory's state as the value it resolves to", () => {
    definePlugin("async_state", {
      state: async () => {
        await Promise.resolve();
        return { ready: true };
      },
      setup: (_ctx, state) => {
        expectTypeOf(state).toEqualTypeOf<{ ready: boolean }>();
      },
    });
  });

  test("types the state as undefined when the descriptor has no factory", () => {
    definePlugin("no_state", {
      setup: (_ctx, state) => {
        expectTypeOf(state).toEqualTypeOf<undefined>();
      },
    });
  });

  test("rejects a bare setup function in place of the descriptor", () => {
    // @ts-expect-error -- the descriptor is the only form
    expectTypeOf(definePlugin).toBeCallableWith("function_form", noop);
  });
});

describe("pluginAdminEntryPath", () => {
  test("resolves the standard dist location for the installed package", () => {
    expect(pluginAdminEntryPath("@plumix/plugin-comments")).toBe(
      "node_modules/@plumix/plugin-comments/dist/admin/index.js",
    );
  });

  test("uses the package name as installed, independent of the plugin id", () => {
    // audit-log's plugin id is `audit_log`, but its package name keeps the
    // hyphen — the path must follow the package, not the id.
    expect(pluginAdminEntryPath("@plumix/plugin-audit-log")).toBe(
      "node_modules/@plumix/plugin-audit-log/dist/admin/index.js",
    );
  });
});

describe("definePlugin — dataMigrations", () => {
  test("passes the module through to the descriptor, with no schemaModule", () => {
    const plugin = definePlugin("flags", {
      setup: noop,
      dataMigrations: "@acme/plugin-flags/data-migrations",
    });

    expect(plugin.dataMigrations).toBe("@acme/plugin-flags/data-migrations");
    expect(plugin.schemaModule).toBeUndefined();
  });
});

describe("PLUGIN_I18N_SLOT", () => {
  test("declares the source locale core's catalogs are authored in", () => {
    expect(PLUGIN_I18N_SLOT.sourceLocale).toBe(coreLingui.sourceLocale);
  });
});

describe("definePlugin — i18n slot", () => {
  test("takes no locale list: the build discovers a plugin's catalogs", () => {
    definePlugin("translated", {
      i18n: {
        sourceLocale: "en",
        // @ts-expect-error — the build discovers locales from the catalogs.
        locales: ["en", "de"],
        catalogPath: "./locales",
      },
      setup: noop,
    });
  });
});
