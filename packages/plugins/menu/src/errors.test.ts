import { describe, expect, test } from "vitest";

import { MenuPluginError } from "./errors.js";

describe("MenuPluginError.invalidLocationId", () => {
  test("class identity, code, exposed fields, and message", () => {
    const err = MenuPluginError.invalidLocationId({
      id: "Bad Id!",
      pattern: "^[a-z][a-z0-9-]*$",
      maxLength: 64,
    });
    expect(err).toBeInstanceOf(MenuPluginError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MenuPluginError");
    expect(err.code).toBe("invalid_location_id");
    expect(err.id).toBe("Bad Id!");
    expect(err.pattern).toBe("^[a-z][a-z0-9-]*$");
    expect(err.maxLength).toBe(64);
    expect(err.message).toContain(
      'registerMenuLocation: id "Bad Id!" is invalid',
    );
    expect(err.message).toContain("^[a-z][a-z0-9-]*$");
    expect(err.message).toContain("1–64 chars");
  });
});

describe("MenuPluginError.locationLabelEmpty", () => {
  test("class identity, code, exposed id, and message", () => {
    const err = MenuPluginError.locationLabelEmpty({ id: "primary" });
    expect(err.code).toBe("location_label_empty");
    expect(err.id).toBe("primary");
    expect(err.message).toContain(
      'registerMenuLocation("primary"): `label` is required',
    );
  });
});
