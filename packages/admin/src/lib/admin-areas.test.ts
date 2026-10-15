import { describe, expect, expectTypeOf, test } from "vitest";

import type { AdminArea } from "@plumix/core";

import type { ADMIN_AREA_SURFACES } from "./admin-areas.js";
import { isSurfaceOffered } from "./admin-areas.js";

describe("the admin area roster", () => {
  test("names every admin area and nothing else", () => {
    // A new member of `AdminArea` fails here, and at the roster's own
    // `satisfies`, until the roster names its surfaces.
    expectTypeOf<keyof typeof ADMIN_AREA_SURFACES>().toEqualTypeOf<AdminArea>();
  });

  test("a surface is offered unless its area is refused", () => {
    expect(isSurfaceOffered("passkeysCard", [])).toBe(true);
    expect(isSurfaceOffered("passkeysCard", ["apiTokens"])).toBe(true);
    expect(isSurfaceOffered("passkeysCard", ["passkeys"])).toBe(false);
  });

  test.each([
    ["passkeysCard", "passkeys"],
    ["selfApiTokens", "apiTokens"],
    ["otherUsersApiTokens", "apiTokens"],
    ["emailChange", "emailDelivery"],
    ["userInvite", "emailDelivery"],
    ["mailerPage", "emailDelivery"],
    ["deviceAuthorizationPage", "deviceAuthorization"],
  ] as const)("refusing %s's area %s hides it", (surface, area) => {
    expect(isSurfaceOffered(surface, [area])).toBe(false);
  });

  test.each([
    "passkeysCard",
    "selfApiTokens",
    "otherUsersApiTokens",
    "emailChange",
    "userInvite",
    "mailerPage",
    "deviceAuthorizationPage",
  ] as const)("refusing only OAuth linking keeps %s", (surface) => {
    expect(isSurfaceOffered(surface, ["oauthLinking"])).toBe(true);
  });
});
