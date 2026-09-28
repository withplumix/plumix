import { describe, expect, test } from "vitest";

import { DEFAULT_BREAKPOINTS } from "@plumix/blocks";

import {
  emptyManifest,
  entryTypeCapability,
  termTaxonomyCapability,
} from "./manifest-types.js";

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

describe("entryTypeCapability", () => {
  test("spells the capability under the namespace the manifest entry carries", () => {
    expect(entryTypeCapability({ capabilityType: "post" }, "edit_any")).toBe(
      "entry:post:edit_any",
    );
  });
});

describe("termTaxonomyCapability", () => {
  test("spells the capability under the taxonomy's name", () => {
    expect(termTaxonomyCapability({ name: "tag" }, "assign")).toBe(
      "term:tag:assign",
    );
  });
});
