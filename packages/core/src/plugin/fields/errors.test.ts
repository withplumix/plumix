import { describe, expect, test } from "vitest";

import { FieldConfigError } from "./errors.js";

describe("FieldConfigError.rangeMinGreaterThanMax", () => {
  test("class identity, code, and exposed fields", () => {
    const err = FieldConfigError.rangeMinGreaterThanMax({
      fieldKey: "score",
      min: 10,
      max: 5,
    });
    expect(err).toBeInstanceOf(FieldConfigError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("FieldConfigError");
    expect(err.code).toBe("range_min_greater_than_max");
    expect(err.fieldKey).toBe("score");
    expect(err.min).toBe(10);
    expect(err.max).toBe(5);
  });

  test("message interpolates fieldKey, min, and max", () => {
    const err = FieldConfigError.rangeMinGreaterThanMax({
      fieldKey: "score",
      min: 10,
      max: 5,
    });
    expect(err.message).toContain('range field "score"');
    expect(err.message).toContain("min (10)");
    expect(err.message).toContain("max (5)");
  });
});

describe("FieldConfigError — repeater factories", () => {
  test("repeaterNestedNotSupported", () => {
    const err = FieldConfigError.repeaterNestedNotSupported({
      repeaterKey: "items",
      subFieldKey: "nested",
    });
    expect(err.code).toBe("repeater_nested_not_supported");
    expect(err.repeaterKey).toBe("items");
    expect(err.subFieldKey).toBe("nested");
    expect(err.message).toContain(
      'repeater("items") subFields contains a nested repeater',
    );
    expect(err.message).toContain('"nested"');
  });

  test("repeaterSubFieldKeyForbidden", () => {
    const err = FieldConfigError.repeaterSubFieldKeyForbidden({
      repeaterKey: "items",
      subFieldKey: "__proto__",
    });
    expect(err.code).toBe("repeater_sub_field_key_forbidden");
    expect(err.message).toContain(
      'repeater("items") subField key "__proto__" is forbidden',
    );
    expect(err.message).toContain("prototype-pollution risk");
  });

  test("repeaterSubFieldKeyInvalid", () => {
    const err = FieldConfigError.repeaterSubFieldKeyInvalid({
      repeaterKey: "items",
      subFieldKey: "bad key!",
      pattern: "^[a-zA-Z0-9_:-]+$",
    });
    expect(err.code).toBe("repeater_sub_field_key_invalid");
    expect(err.pattern).toBe("^[a-zA-Z0-9_:-]+$");
    expect(err.message).toContain(
      'repeater("items") subField key "bad key!" must match',
    );
    expect(err.message).toContain("^[a-zA-Z0-9_:-]+$");
  });

  test("repeaterSubFieldDuplicate", () => {
    const err = FieldConfigError.repeaterSubFieldDuplicate({
      repeaterKey: "items",
      subFieldKey: "title",
    });
    expect(err.code).toBe("repeater_sub_field_duplicate");
    expect(err.message).toContain(
      'repeater("items") declares subField "title" more than once',
    );
  });
});
