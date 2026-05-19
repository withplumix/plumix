import { describe, expect, test } from "vitest";

import { VIEWPORT_MAX_PX } from "../index.js";

describe("VIEWPORT_MAX_PX", () => {
  test("exposes the canonical responsive breakpoints", () => {
    expect(VIEWPORT_MAX_PX).toEqual({ medium: 991, small: 640 });
  });
});
