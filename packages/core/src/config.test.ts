import { expect, test } from "vitest";

import type { RuntimeAdapter } from "./runtime/adapter.js";
import type { DatabaseAdapter, ImageDelivery } from "./runtime/slots.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { defineTheme } from "./theme.js";

const runtime: RuntimeAdapter = {
  name: "mock",
  buildFetchHandler: () => () => new Response("ok"),
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

const theme = defineTheme({ templates: { index: () => null } });

test("plumix() defaults missing plugins to an empty array", () => {
  const config = plumix({ runtime, database, auth: authConfig, theme });
  expect(config.plugins).toEqual([]);
});

test("plumix() exposes defineConfig as an alias", async () => {
  const { defineConfig } = await import("./config.js");
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
