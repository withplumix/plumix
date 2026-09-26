import type { ORPCErrorConstructorMap } from "@orpc/server";
import type * as v from "valibot";
import { describe, expectTypeOf, test } from "vitest";

import type { assertCanEditEntry } from "../entries/editability.js";
import type { RPC_ERRORS, RpcErrors } from "./errors.js";
import type {
  metaValidationConflict,
  sanitizeMetaForRpc,
} from "./meta/core.js";
import type { assertLookupOk } from "./procedures/auth/device-flow/lookup-helpers.js";
import type {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./procedures/entry/content.js";
import type { assertAccessChoiceDeclared } from "./procedures/entry/helpers.js";
import type { entryDeletableGuards } from "./procedures/entry/lifecycle.js";
import type {
  assertEntryMetaCapabilities,
  assertMetaCapabilities,
} from "./procedures/entry/meta.js";
import type { previewableEntry } from "./procedures/entry/previewable.js";
import type { toRpcEntryReadError } from "./procedures/entry/read-errors.js";
import type { buildTermsPatchGuards } from "./procedures/entry/terms.js";
import type { requireAdapter } from "./procedures/lookup/schemas.js";
import type { assertTermMetaCapabilities } from "./procedures/term/meta.js";
import type { toRpcTermReadError } from "./procedures/term/read-errors.js";
import type { assertUserMetaCapabilities } from "./procedures/user/meta.js";

describe("RPC_ERRORS subsets", () => {
  test("every helper taking a procedure's errors accepts a subset of RPC_ERRORS", () => {
    type Forbidden = Pick<RpcErrors, "FORBIDDEN">;
    type Lookup = Pick<RpcErrors, "NOT_FOUND" | "FORBIDDEN">;

    expectTypeOf<
      Parameters<typeof assertCanEditEntry>[2]
    >().toEqualTypeOf<Forbidden>();
    expectTypeOf<
      Parameters<typeof previewableEntry>[2]
    >().toEqualTypeOf<Lookup>();
    expectTypeOf<
      Parameters<typeof entryDeletableGuards>[0]
    >().toEqualTypeOf<Lookup>();
    expectTypeOf<
      Parameters<typeof requireAdapter>[2]
    >().toEqualTypeOf<Lookup>();
    expectTypeOf<
      Parameters<typeof toRpcTermReadError>[1]
    >().toEqualTypeOf<Lookup>();
    expectTypeOf<Parameters<typeof toRpcEntryReadError>[1]>().toEqualTypeOf<
      Pick<RpcErrors, "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST">
    >();
    expectTypeOf<Parameters<typeof buildTermsPatchGuards>[0]>().toEqualTypeOf<
      Pick<RpcErrors, "NOT_FOUND" | "FORBIDDEN" | "CONFLICT">
    >();
    expectTypeOf<Parameters<typeof assertLookupOk>[2]>().toEqualTypeOf<
      Pick<RpcErrors, "NOT_FOUND" | "CONFLICT">
    >();
    expectTypeOf<
      Parameters<typeof assertAccessChoiceDeclared>[2]
    >().toEqualTypeOf<Pick<RpcErrors, "BAD_REQUEST">>();
    expectTypeOf<
      Parameters<typeof assertContentWithinByteCap>[1]
    >().toEqualTypeOf<Pick<RpcErrors, "CONFLICT">>();
    expectTypeOf<
      Parameters<typeof assertContentValidAgainstRegistries>[2]
    >().toEqualTypeOf<Pick<RpcErrors, "INVALID_BLOCK_CONTENT">>();
    expectTypeOf<Parameters<typeof sanitizeMetaForRpc>[2]>().toEqualTypeOf<
      Pick<RpcErrors, "CONFLICT">
    >();
    expectTypeOf<Parameters<typeof metaValidationConflict>[1]>().toEqualTypeOf<
      Pick<RpcErrors, "CONFLICT">
    >();
    expectTypeOf<
      Parameters<typeof assertMetaCapabilities>[3]
    >().toEqualTypeOf<Forbidden>();
    expectTypeOf<
      Parameters<typeof assertEntryMetaCapabilities>[4]
    >().toEqualTypeOf<Forbidden>();
    expectTypeOf<
      Parameters<typeof assertTermMetaCapabilities>[4]
    >().toEqualTypeOf<Forbidden>();
    expectTypeOf<
      Parameters<typeof assertUserMetaCapabilities>[3]
    >().toEqualTypeOf<Forbidden>();
  });

  test("renaming a field in RPC_ERRORS breaks the helper that throws it", () => {
    type Renamed = Omit<typeof RPC_ERRORS, "FORBIDDEN"> & {
      readonly FORBIDDEN: {
        readonly message: string;
        readonly data: v.ObjectSchema<
          { readonly permission: v.StringSchema<undefined> },
          undefined
        >;
      };
    };

    expectTypeOf<RpcErrors>().toExtend<
      Parameters<typeof assertCanEditEntry>[2]
    >();
    expectTypeOf<ORPCErrorConstructorMap<Renamed>>().not.toExtend<
      Parameters<typeof assertCanEditEntry>[2]
    >();
  });
});
