import { describe, expect, test } from "vitest";

import { MAGIC_LINK_ERROR_CODES } from "@plumix/core";

import {
  MAGIC_LINK_ERROR_MESSAGES,
  magicLinkErrorDescriptor,
} from "./magic-link-errors.js";

describe("magicLinkErrorDescriptor", () => {
  test("maps every server-defined error code", () => {
    // Adding a code in core without updating this map silently degrades
    // to the fallback descriptor. Catch the drift here.
    for (const code of MAGIC_LINK_ERROR_CODES) {
      expect(MAGIC_LINK_ERROR_MESSAGES[code].message).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(magicLinkErrorDescriptor(undefined)).toBeNull();
    expect(magicLinkErrorDescriptor("")).toBeNull();
  });

  test("falls back to the generic descriptor for unknown codes", () => {
    const descriptor = magicLinkErrorDescriptor("server_added_a_new_code");
    expect(descriptor).not.toBeNull();
    expect(descriptor?.message).toMatch(/try again/i);
  });
});
