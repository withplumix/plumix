import { describe, expect, test } from "vitest";

import { parseMediaMeta } from "./meta.js";

const base = { storageKey: "2026/07/x.png", mime: "image/png", size: 1234 };

describe("parseMediaMeta — dimensions", () => {
  test("carries width and height when present", () => {
    const meta = parseMediaMeta({ ...base, width: 800, height: 600 });
    expect(meta).toMatchObject({ width: 800, height: 600 });
  });

  test("defaults dimensions to null when absent", () => {
    const meta = parseMediaMeta(base);
    expect(meta).toMatchObject({ width: null, height: null });
  });

  test("ignores non-numeric dimensions", () => {
    const meta = parseMediaMeta({ ...base, width: "800", height: null });
    expect(meta).toMatchObject({ width: null, height: null });
  });
});
