import { afterEach, describe, expect, test, vi } from "vitest";

import { devClientParts } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devClientParts", () => {
  test("without a hot client, installs no compile overlay", () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    const parts = devClientParts();

    expect(parts.map((part) => part.name)).toEqual([
      "island-overlay",
      "terminal-forwarding",
    ]);
  });

  test("with the dev gate off, installs nothing", () => {
    vi.stubEnv("PLUMIX_DEV", "");

    const parts = devClientParts();

    expect(parts).toEqual([]);
  });
});
