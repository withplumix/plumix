import { describe, expect, test } from "vitest";

import { userDisplayName } from "./display-name.js";

describe("userDisplayName", () => {
  test("uses the trimmed name", () => {
    expect(
      userDisplayName({ name: "  Alex Rivera ", email: "alex@cms.example" }),
    ).toBe("Alex Rivera");
  });

  test("falls back to the email when the name is null, absent or blank", () => {
    expect(userDisplayName({ name: null, email: "alex@cms.example" })).toBe(
      "alex@cms.example",
    );
    expect(userDisplayName({ email: "alex@cms.example" })).toBe(
      "alex@cms.example",
    );
    expect(userDisplayName({ name: "   ", email: "alex@cms.example" })).toBe(
      "alex@cms.example",
    );
  });
});
