import { expect, test } from "vitest";

import type { RuntimeAdapter } from "./runtime/adapter.js";
import type { DatabaseAdapter } from "./runtime/slots.js";
import { plumix } from "./config.js";

const runtime: RuntimeAdapter = {
  name: "mock",
  buildFetchHandler: () => () => new Response("ok"),
  cli: {
    dev: () => Promise.resolve(),
    build: () => Promise.resolve({ outputPath: "" }),
    deploy: () => Promise.resolve({}),
    types: () => Promise.resolve(),
    migrate: () => Promise.resolve(),
  },
};

const database: DatabaseAdapter = {
  kind: "mock",
  connect: () => ({ db: {}, commit: () => null }),
};

test("plumix() defaults missing plugins and themes to empty arrays", () => {
  const config = plumix({ runtime, database });
  expect(config.plugins).toEqual([]);
  expect(config.themes).toEqual([]);
});
