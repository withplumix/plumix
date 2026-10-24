import { describe, expectTypeOf, test } from "vitest";

import type { Capability, KnownCapability } from "./capability.js";

describe("KnownCapability", () => {
  test("names each core capability, so a capability slot autocompletes them", () => {
    expectTypeOf<KnownCapability>().toEqualTypeOf<
      | "admin:access"
      | "entry:post:read"
      | "entry:post:create"
      | "entry:post:edit_own"
      | "entry:post:publish"
      | "entry:post:edit_any"
      | "entry:post:delete"
      | "entry:post:read_revisions"
      | "entry:post:restore_revision"
      | "user:list"
      | "user:edit_own"
      | "user:create"
      | "user:edit"
      | "user:promote"
      | "user:delete"
      | "user:manage_tokens"
      | "plugin:manage"
      | "settings:manage"
    >();
  });

  test("a capability slot still takes a name core does not know", () => {
    expectTypeOf<"seo:manage">().toExtend<Capability>();
  });
});
