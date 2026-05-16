import { describe, expect, test } from "vitest";

import { BlockRegistrationError } from "./errors.js";

describe("BlockRegistrationError", () => {
  test("name is BlockRegistrationError on every instance", () => {
    const err = BlockRegistrationError.invalidNamePattern({
      name: "BAD",
      pattern: "^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$",
    });
    expect(err.name).toBe("BlockRegistrationError");
  });

  test("is throwable and catchable by class", () => {
    expect(() => {
      throw BlockRegistrationError.duplicateName({
        name: "core/paragraph",
        layer: "core",
      });
    }).toThrow(BlockRegistrationError);
  });

  test("invalidNamePattern carries code and fields", () => {
    const err = BlockRegistrationError.invalidNamePattern({
      name: "BAD",
      pattern: "^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$",
    });
    expect(err.code).toBe("invalid_name_pattern");
    expect(err.blockName).toBe("BAD");
    expect(err.pattern).toBe("^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$");
    expect(err.message).toContain("BAD");
    expect(err.message).toContain("namespace/name");
  });

  test("duplicateName carries code and layer", () => {
    const err = BlockRegistrationError.duplicateName({
      name: "core/paragraph",
      layer: "core",
    });
    expect(err.code).toBe("duplicate_name");
    expect(err.blockName).toBe("core/paragraph");
    expect(err.layer).toBe("core");
    expect(err.message).toContain("core/paragraph");
  });

  test("coreBlockCollision when plugin uses core namespace", () => {
    const err = BlockRegistrationError.coreBlockCollision({
      name: "core/something",
      registeredBy: "my-plugin",
    });
    expect(err.code).toBe("core_block_collision");
    expect(err.blockName).toBe("core/something");
    expect(err.registeredBy).toBe("my-plugin");
  });

  test("themeOverrideUnknownName", () => {
    const err = BlockRegistrationError.themeOverrideUnknownName({
      name: "made-up/block",
      themeId: "acme",
    });
    expect(err.code).toBe("theme_override_unknown_name");
    expect(err.blockName).toBe("made-up/block");
    expect(err.themeId).toBe("acme");
  });

  test("schemaNameMismatch when spec.name != schema.name", () => {
    const err = BlockRegistrationError.schemaNameMismatch({
      specName: "core/paragraph",
      schemaName: "paragraph",
    });
    expect(err.code).toBe("schema_name_mismatch");
    expect(err.blockName).toBe("core/paragraph");
    expect(err.schemaName).toBe("paragraph");
  });

  test("unknownAttributeType", () => {
    const err = BlockRegistrationError.unknownAttributeType({
      name: "core/paragraph",
      attributeName: "weird",
      attributeType: "non-existent-type",
    });
    expect(err.code).toBe("unknown_attribute_type");
    expect(err.blockName).toBe("core/paragraph");
    expect(err.attributeName).toBe("weird");
    expect(err.attributeType).toBe("non-existent-type");
  });
});
