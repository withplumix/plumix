import { describe, expect, test } from "vitest";

import { AdminRuntimeError } from "./errors.js";

describe("AdminRuntimeError.notInitialised", () => {
  test("class identity, code, and message", () => {
    const err = AdminRuntimeError.notInitialised();
    expect(err).toBeInstanceOf(AdminRuntimeError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AdminRuntimeError");
    expect(err.code).toBe("not_initialised");
    expect(err.message).toContain(
      "plumix admin runtime not initialised — plugin chunk loaded before host bundle.",
    );
  });
});
