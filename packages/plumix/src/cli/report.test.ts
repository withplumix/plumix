import { afterEach, describe, expect, test, vi } from "vitest";

import { badge } from "./report.js";

describe("badge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("writes the plumix label and version to stderr", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    badge("1.2.3");

    const out = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toContain("plumix");
    expect(out).toContain("v1.2.3");
  });
});
