import { afterEach, describe, expect, test } from "vitest";

import type { IslandStrategy } from "./island-element.js";
import { islandStrategy, publishIslandStrategy } from "./island-global.js";

const load: IslandStrategy = () => undefined;
const idle: IslandStrategy = () => undefined;

describe("island strategy namespace", () => {
  afterEach(() => {
    delete (window as { Plumix?: unknown }).Plumix;
  });

  test("resolves a strategy under the name it was published as", () => {
    publishIslandStrategy("load", load);

    expect(islandStrategy("load")).toBe(load);
  });

  test("keeps strategies the other strategy modules already published", () => {
    publishIslandStrategy("load", load);
    publishIslandStrategy("idle", idle);

    expect(islandStrategy("load")).toBe(load);
    expect(islandStrategy("idle")).toBe(idle);
  });

  test("resolves an unpublished name as undefined", () => {
    expect(islandStrategy("load")).toBeUndefined();
  });
});
