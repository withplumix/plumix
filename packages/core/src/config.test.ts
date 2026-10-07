import { expect, expectTypeOf, test } from "vitest";

import type {
  AnyPluginDescriptor,
  PlumixConfig,
  PlumixConfigInput,
  ResolvedI18n,
} from "./config.js";
import type { RuntimeAdapter } from "./context/runtime-adapter.js";
import type { FrameworkRoutes } from "./route/contract/framework-routes.js";
import type { RedirectRule } from "./route/contract/redirects.js";
import type {
  DatabaseAdapter,
  ImageDelivery,
} from "./runtime/contract/slots.js";
import type { ThemeDescriptor } from "./theme.js";
import { auth } from "./auth/config.js";
import { fallback } from "./route/render/template-builders.js";
import { plumix } from "./runtime/define-config.js";
import { defineTheme } from "./theme.js";
import { welcomeTheme } from "./welcome-theme.js";

const runtime: RuntimeAdapter = {
  name: "mock",
  handler: {},
  generateEntry: () => "",
};

const database: DatabaseAdapter = {
  kind: "mock",
  connect: () => ({ db: {} }),
};

const authConfig = auth({
  passkey: {
    rpName: "mock",
    rpId: "cms.example",
    origin: "https://cms.example",
  },
});

const theme = defineTheme({ templates: [fallback(() => null)] });

test("plumix() defaults a missing theme to the built-in welcome theme", () => {
  const config = plumix({ runtime, database, auth: authConfig });
  expect(config.theme).toBe(welcomeTheme);
});

test("plumix() preserves an explicitly provided theme", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.theme).toBe(theme);
});

test("plumix() defaults missing plugins to an empty array", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.plugins).toEqual([]);
});

test("plumix() exposes defineConfig as an alias", async () => {
  const { defineConfig } = await import("./runtime/define-config.js");
  expect(defineConfig).toBe(plumix);
});

test("plumix() preserves imageDelivery slot when provided", () => {
  const imageDelivery: ImageDelivery = {
    kind: "stub",
    url: (src, opts) =>
      opts?.width === undefined ? src : `${src}?w=${opts.width}`,
  };
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    imageDelivery,
  });
  expect(config.imageDelivery).toBe(imageDelivery);
  expect(
    config.imageDelivery?.url("https://media.example/cat.jpg", { width: 800 }),
  ).toBe("https://media.example/cat.jpg?w=800");
});

test("plumix() leaves imageDelivery undefined when not provided", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.imageDelivery).toBeUndefined();
});

test("plumix() preserves the top-level mailer slot", () => {
  const mailer = { send: () => Promise.resolve() };
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    mailer,
  });
  expect(config.mailer).toBe(mailer);
});

test("plumix() requires mailer when auth.magicLink is configured", () => {
  const authWithMagicLink = auth({
    passkey: {
      rpName: "mock",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
    magicLink: { siteName: "mock" },
  });
  expect(() =>
    plumix({ runtime, database, auth: authWithMagicLink, theme }),
  ).toThrow(/magicLink.*requires.*mailer/);
});

test("plumix() resolves i18n input into a registry and stores it on the config", () => {
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    i18n: { defaultLocale: "ar", locales: ["ar", "en"] },
  });
  expect(config.i18n.defaultLocale.code).toBe("ar");
  expect(config.i18n.defaultLocale.direction).toBe("rtl");
  expect(config.i18n.locales.map((l) => l.code)).toEqual(["ar", "en"]);
});

test("plumix() defaults to an English-only registry when i18n is omitted", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.i18n.defaultLocale.code).toBe("en");
  expect(config.i18n.locales).toHaveLength(1);
});

test("plumix() preserves top-level vite passthrough for the Vite layer to consume", () => {
  const probe = { name: "probe" };
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    vite: { plugins: [probe], optimizeDeps: { exclude: ["x"] } },
  });
  expect(config.vite?.plugins).toEqual([probe]);
  expect(config.vite?.optimizeDeps).toEqual({ exclude: ["x"] });
});

test("plumix() defaults basePath to the empty string (root deployment)", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.basePath).toBe("");
});

test("plumix() keeps every framework route family when routes is omitted", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.routes).toEqual({ author: true, date: true, search: true });
});

test("plumix() turns off only the route families the site sets to false", () => {
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    routes: { date: false },
  });
  expect(config.routes).toEqual({ author: true, date: false, search: true });
});

test("plumix() normalizes a configured basePath to its canonical form", () => {
  const config = plumix({
    runtime,
    database,
    auth: authConfig,
    theme,
    basePath: "custom-directory/",
  });
  expect(config.basePath).toBe("/custom-directory");
});

test("plumix() accepts auth.magicLink when paired with a top-level mailer", () => {
  const authWithMagicLink = auth({
    passkey: {
      rpName: "mock",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
    magicLink: { siteName: "mock" },
  });
  const mailer = { send: () => Promise.resolve() };
  expect(() =>
    plumix({ runtime, database, auth: authWithMagicLink, theme, mailer }),
  ).not.toThrow();
});

test("plumix() carries the raw dev config through untouched", () => {
  const dev = {
    bar: { position: "top-left" },
    panels: { timeline: false },
  } as const;
  const config = plumix({ runtime, database, auth: authConfig, dev });
  expect(config.dev).toBe(dev);
});

test("plumix() leaves dev undefined when unset", () => {
  const config = plumix({ runtime, database, auth: authConfig });
  expect(config.dev).toBeUndefined();
});

// `Required` makes a newly declared slot a compile error here until it is set,
// so the identity check below covers it without anyone remembering to.
const everySlot: Required<PlumixConfigInput> = {
  runtime,
  database,
  auth: authConfig,
  storage: { kind: "mock", connect: () => ({}) as never },
  imageDelivery: { kind: "mock", url: (src) => src },
  kv: { kind: "mock", connect: () => ({}) as never },
  cdn: { kind: "mock", connect: () => null },
  mailer: { send: () => Promise.resolve() },
  mail: { overrides: {} },
  theme,
  plugins: [],
  i18n: { defaultLocale: "en", locales: ["en", "fr"] },
  redirects: [],
  routes: { date: false },
  basePath: "/docs/",
  mcp: { enabled: true },
  api: { enabled: true },
  dev: { bar: false },
  telemetry: { consumers: [] },
  blocks: { htmlAllowlist: {} },
  images: { remotePatterns: [] },
  vite: {},
};

const RESOLVED_SLOTS = new Set([
  "theme",
  "plugins",
  "i18n",
  "redirects",
  "routes",
  "basePath",
]);

test("plumix() hands every pass-through slot on as the object the operator wrote", () => {
  const config = plumix(everySlot);
  const passThrough = Object.keys(everySlot).filter(
    (key) => !RESOLVED_SLOTS.has(key),
  );
  expect(passThrough.length).toBeGreaterThan(0);
  for (const key of passThrough) {
    expect(config[key as keyof PlumixConfig], key).toBe(
      everySlot[key as keyof PlumixConfigInput],
    );
  }
});

test("PlumixConfig declares exactly the input's slots, resolving only the six it normalizes", () => {
  expectTypeOf<keyof PlumixConfig>().toEqualTypeOf<keyof PlumixConfigInput>();
  expectTypeOf<PlumixConfig["theme"]>().toEqualTypeOf<ThemeDescriptor>();
  expectTypeOf<PlumixConfig["plugins"]>().toEqualTypeOf<
    readonly AnyPluginDescriptor[]
  >();
  expectTypeOf<PlumixConfig["i18n"]>().toEqualTypeOf<ResolvedI18n>();
  expectTypeOf<PlumixConfig["redirects"]>().toEqualTypeOf<
    readonly RedirectRule[]
  >();
  expectTypeOf<PlumixConfig["routes"]>().toEqualTypeOf<FrameworkRoutes>();
  expectTypeOf<PlumixConfig["basePath"]>().toEqualTypeOf<string>();
});
