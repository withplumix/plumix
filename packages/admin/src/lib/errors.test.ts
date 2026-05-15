import { describe, expect, test } from "vitest";

import { AdminPluginRegistryError } from "./errors.js";

describe("AdminPluginRegistryError.duplicateKey", () => {
  test("class identity, code, exposed fields, and message", () => {
    const err = AdminPluginRegistryError.duplicateKey({
      registerName: "registerPluginPage",
      key: "/media",
    });
    expect(err).toBeInstanceOf(AdminPluginRegistryError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AdminPluginRegistryError");
    expect(err.code).toBe("duplicate_key");
    expect(err.registerName).toBe("registerPluginPage");
    expect(err.key).toBe("/media");
    expect(err.message).toContain(
      'registerPluginPage: "/media" is already registered',
    );
  });
});

describe("AdminPluginRegistryError.inputTypeReserved", () => {
  test("class identity, code, exposed type, and message", () => {
    const err = AdminPluginRegistryError.inputTypeReserved({ type: "text" });
    expect(err.code).toBe("input_type_reserved");
    expect(err.type).toBe("text");
    expect(err.message).toContain(
      'registerPluginFieldType: "text" is reserved for built-in renderers',
    );
    expect(err.message).toContain("RESERVED_INPUT_TYPES list");
  });
});
