// Enforced by `tsc`, not by the vitest run.

import { describe, expectTypeOf, test } from "vitest";

import type { Entry } from "../db/schema/entries.js";
import type {
  RegisteredEntryType,
  RestResourceHandlerArgs,
} from "./manifest.js";

describe("RestResourceHandlerArgs", () => {
  test("a path with both segments binds the entry type and the entry", () => {
    type Args = RestResourceHandlerArgs<"/{collection}/{entry}/comments">;
    expectTypeOf<Args["entryType"]>().toEqualTypeOf<RegisteredEntryType>();
    expectTypeOf<Args["entry"]>().toEqualTypeOf<Entry>();
  });

  test("a path with only `{entry}` binds the entry and no entry type", () => {
    type Args = RestResourceHandlerArgs<"/system/{entry}/likes">;
    expectTypeOf<Args["entry"]>().toEqualTypeOf<Entry>();
    expectTypeOf<Args>().not.toHaveProperty("entryType");
  });

  test("a path without reserved segments binds neither", () => {
    type Args = RestResourceHandlerArgs<"/system/{entry_id}/likes">;
    expectTypeOf<Args>().not.toHaveProperty("entry");
    expectTypeOf<Args>().not.toHaveProperty("entryType");
  });
});
