import { describe, expect, test } from "vitest";

import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";

import { emptyManifest } from "./manifest-types.js";

describe("emptyManifest", () => {
  test("populates breakpoints with the theme default, like buildManifest does", () => {
    expect(emptyManifest().breakpoints).toEqual(DEFAULT_BREAKPOINTS);
  });

  test("reports every infrastructure slot as not configured", () => {
    expect(emptyManifest().configuredSlots).toEqual({
      storage: false,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: false,
    });
  });
});
