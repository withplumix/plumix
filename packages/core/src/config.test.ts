import { expect, test } from "vitest";

import type { RuntimeAdapter } from "./runtime/adapter.js";
import type { DatabaseAdapter } from "./runtime/slots.js";
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
