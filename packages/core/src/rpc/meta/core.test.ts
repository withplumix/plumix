import { describe, expect, test } from "vitest";

import { MetaSanitizationError } from "./core.js";

describe("MetaSanitizationError", () => {
  test("error.name is the class name, not 'Error'", () => {
    const err = MetaSanitizationError.notRegistered({ key: "tag" });
    expect(err).toBeInstanceOf(MetaSanitizationError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MetaSanitizationError");
  });
});
