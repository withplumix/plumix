import type { MessageDescriptor } from "@lingui/core";
import { describe, expectTypeOf, test } from "vitest";

import type { UserRole } from "@plumix/core/manifest";

import { ROLE_LABEL, ROLE_LABEL_LONG } from "./user-role-labels.js";

describe("ROLE_LABEL", () => {
  test("labels exactly core's user roles", () => {
    expectTypeOf(ROLE_LABEL).toEqualTypeOf<
      Record<UserRole, MessageDescriptor>
    >();
  });

  test("describes exactly core's user roles at length", () => {
    expectTypeOf(ROLE_LABEL_LONG).toEqualTypeOf<
      Record<UserRole, MessageDescriptor>
    >();
  });
});
