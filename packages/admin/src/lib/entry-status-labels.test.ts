import type { MessageDescriptor } from "@lingui/core";
import { describe, expectTypeOf, test } from "vitest";

import type { EntryStatus } from "@plumix/core/manifest";

import { ENTRY_STATUS_LABEL } from "./entry-status-labels.js";

describe("ENTRY_STATUS_LABEL", () => {
  test("labels exactly core's entry statuses", () => {
    expectTypeOf(ENTRY_STATUS_LABEL).toEqualTypeOf<
      Record<EntryStatus, MessageDescriptor>
    >();
  });
});
