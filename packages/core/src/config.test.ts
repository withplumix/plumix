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
