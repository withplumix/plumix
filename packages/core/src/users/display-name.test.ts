import { describe, expect, test } from "vitest";

import { userDisplayName } from "./display-name.js";

describe("userDisplayName", () => {
  test("uses the trimmed name", () => {
    expect(
      userDisplayName({ name: "  Alex Rivera ", email: "alex@cms.example" }),
    ).toBe("Alex Rivera");
  });

  test.each([
    ["null", { name: null, email: "alex@cms.example" }],
    ["absent", { email: "alex@cms.example" }],
    ["blank", { name: "   ", email: "alex@cms.example" }],
  ])("falls back to the email when the name is %s", (_case, user) => {
    expect(userDisplayName(user)).toBe("alex@cms.example");
  });
});
