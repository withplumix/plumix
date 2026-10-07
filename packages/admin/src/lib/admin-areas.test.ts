import { describe, expect, expectTypeOf, test } from "vitest";

import type { AdminArea } from "@plumix/core";

import type { ADMIN_AREA_SURFACES, AdminAreaSurface } from "./admin-areas.js";
import { isSurfaceOffered } from "./admin-areas.js";

describe("the admin area roster", () => {
  test("names every admin area and nothing else", () => {
    // A new member of `AdminArea` fails here, and at the roster's own
    // `satisfies`, until the roster names its surfaces.
    expectTypeOf<keyof typeof ADMIN_AREA_SURFACES>().toEqualTypeOf<AdminArea>();
    // @ts-expect-error — a roster missing `oauthLinking` names too few areas.
    const missing: Record<AdminArea, readonly AdminAreaSurface[]> = {
      apiTokens: [],
      deviceAuthorization: [],
      passkeys: [],
      emailDelivery: [],
    };
    expect(missing).toBeDefined();
  });

  test("a surface is offered unless its area is refused", () => {
    expect(isSurfaceOffered("passkeysCard", [])).toBe(true);
    expect(isSurfaceOffered("passkeysCard", ["apiTokens"])).toBe(true);
    expect(isSurfaceOffered("passkeysCard", ["passkeys"])).toBe(false);
  });
});
