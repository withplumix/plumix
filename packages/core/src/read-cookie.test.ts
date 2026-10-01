import { describe, expect, test } from "vitest";

import { readCookie } from "./read-cookie.js";

const withCookie = (cookie: string) =>
  new Request("https://x.example", { headers: { cookie } });

describe("readCookie", () => {
  test("returns the named cookie's value among others", () => {
    expect(readCookie(withCookie("a=1; locale=fr; b=2"), "locale")).toBe("fr");
  });

  test("returns null with no Cookie header, a missing name or an empty value", () => {
    expect(readCookie(new Request("https://x.example"), "locale")).toBeNull();
    expect(readCookie(withCookie("a=1"), "locale")).toBeNull();
    expect(readCookie(withCookie("locale="), "locale")).toBeNull();
  });

  test("reads only the Cookie header, never the URL", () => {
    const req = new Request("https://x.example/?locale=fr");
    expect(readCookie(req, "locale")).toBeNull();
  });
});
