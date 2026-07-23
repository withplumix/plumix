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

describe("FieldConfigError — sub-field factories", () => {
  test("subFieldKeyForbidden carries container + attribution", () => {
    const err = FieldConfigError.subFieldKeyForbidden({
      container: "repeater",
      containerKey: "items",
      subFieldKey: "__proto__",
    });
    expect(err.code).toBe("sub_field_key_forbidden");
    expect(err.container).toBe("repeater");
    expect(err.containerKey).toBe("items");
    expect(err.subFieldKey).toBe("__proto__");
    expect(err.message).toContain(
      'repeater("items") field key "__proto__" is forbidden',
    );
    expect(err.message).toContain("prototype-pollution risk");
  });

  test("subFieldKeyInvalid names the group container", () => {
    const err = FieldConfigError.subFieldKeyInvalid({
      container: "group",
      containerKey: "seo",
      subFieldKey: "bad key!",
      pattern: "^[a-zA-Z0-9_:-]+$",
    });
    expect(err.code).toBe("sub_field_key_invalid");
    expect(err.container).toBe("group");
    expect(err.pattern).toBe("^[a-zA-Z0-9_:-]+$");
    expect(err.message).toContain(
      'group("seo") field key "bad key!" must match',
    );
    expect(err.message).toContain("^[a-zA-Z0-9_:-]+$");
  });

  test("subFieldDuplicate", () => {
    const err = FieldConfigError.subFieldDuplicate({
      container: "repeater",
      containerKey: "items",
      subFieldKey: "title",
    });
    expect(err.code).toBe("sub_field_duplicate");
    expect(err.message).toContain(
      'repeater("items") declares field "title" more than once',
    );
  });

  test("subFieldCondition", () => {
    const err = FieldConfigError.subFieldCondition({
      container: "group",
      containerKey: "seo",
      subFieldKey: "title",
    });
    expect(err.code).toBe("sub_field_condition_not_supported");
    expect(err.message).toContain(
      'group("seo") field "title" does not support visibleWhen',
    );
  });
});
