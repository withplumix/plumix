import { expect, test } from "vitest";

import type { RuntimeAdapter } from "./runtime/adapter.js";
import type { DatabaseAdapter, ImageDelivery } from "./runtime/slots.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";

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

test("plumix() defaults missing plugins and themes to empty arrays", () => {
  const config = plumix({ runtime, database, auth: authConfig });
  expect(config.plugins).toEqual([]);
  expect(config.themes).toEqual([]);
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
    imageDelivery,
  });
  expect(config.imageDelivery).toBe(imageDelivery);
  expect(
    config.imageDelivery?.url("https://media.example/cat.jpg", { width: 800 }),
  ).toBe("https://media.example/cat.jpg?w=800");
});

test("plumix() leaves imageDelivery undefined when not provided", () => {
  const config = plumix({ runtime, database, auth: authConfig });
  expect(config.imageDelivery).toBeUndefined();
});

test("plumix() preserves the top-level mailer slot", () => {
  const mailer = { send: () => Promise.resolve() };
  const config = plumix({ runtime, database, auth: authConfig, mailer });
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
  expect(() => plumix({ runtime, database, auth: authWithMagicLink })).toThrow(
    /magicLink.*requires.*mailer/,
  );
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
    plumix({ runtime, database, auth: authWithMagicLink, mailer }),
  ).not.toThrow();
});
