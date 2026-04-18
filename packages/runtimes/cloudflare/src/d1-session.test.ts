import { describe, expect, test } from "vitest";

import {
  buildBookmarkCookie,
  isValidBookmark,
  MAX_BOOKMARK_LENGTH,
} from "./d1-session.js";

describe("isValidBookmark", () => {
  test("accepts a typical opaque bookmark", () => {
    expect(isValidBookmark("0000020cf4c8f510-00007c12")).toBe(true);
  });

  test("accepts the max-length bookmark", () => {
    expect(isValidBookmark("a".repeat(MAX_BOOKMARK_LENGTH))).toBe(true);
  });

  test("rejects the empty string", () => {
    expect(isValidBookmark("")).toBe(false);
  });

  test("rejects a bookmark longer than the cap", () => {
    expect(isValidBookmark("a".repeat(MAX_BOOKMARK_LENGTH + 1))).toBe(false);
  });

  test("rejects control characters (below 0x20)", () => {
    expect(isValidBookmark("abc\ndef")).toBe(false);
    expect(isValidBookmark("abc\x00def")).toBe(false);
    expect(isValidBookmark("abc\x1fdef")).toBe(false);
  });

  test("rejects DEL (0x7f)", () => {
    expect(isValidBookmark("abc\x7fdef")).toBe(false);
  });
});

describe("buildBookmarkCookie", () => {
  test("emits a HttpOnly + SameSite=Lax cookie on /", () => {
    const cookie = buildBookmarkCookie("abc", "__plumix_d1_bookmark", false);
    expect(cookie).toBe(
      "__plumix_d1_bookmark=abc; Path=/; HttpOnly; SameSite=Lax",
    );
  });

  test("appends Secure when the request is https", () => {
    const cookie = buildBookmarkCookie("abc", "__plumix_d1_bookmark", true);
    expect(cookie).toBe(
      "__plumix_d1_bookmark=abc; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });

  test("never emits Max-Age (session cookie lifetime)", () => {
    const cookie = buildBookmarkCookie("abc", "bm", true);
    expect(cookie).not.toContain("Max-Age");
  });
});
