import { describe, expect, test } from "vitest";

import { buildRobotsTxt } from "./robots.js";

describe("buildRobotsTxt", () => {
  test("a public site allows all crawling", () => {
    expect(buildRobotsTxt({ isPublic: true })).toBe(
      "User-agent: *\nDisallow:\n",
    );
  });

  test("a private site disallows everything", () => {
    expect(buildRobotsTxt({ isPublic: false })).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });
});
