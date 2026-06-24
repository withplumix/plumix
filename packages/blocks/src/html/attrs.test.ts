import { describe, expect, test } from "vitest";

import { isAllowedHtmlAttr, safeHtmlAttrs } from "./attrs.js";

describe("isAllowedHtmlAttr", () => {
  test("allows safe global, aria-*, and data-* attributes", () => {
    expect(isAllowedHtmlAttr("id")).toBe(true);
    expect(isAllowedHtmlAttr("title")).toBe(true);
    expect(isAllowedHtmlAttr("role")).toBe(true);
    expect(isAllowedHtmlAttr("aria-label")).toBe(true);
    expect(isAllowedHtmlAttr("data-track")).toBe(true);
  });

  test("rejects event handlers (the XSS surface), case-insensitively", () => {
    expect(isAllowedHtmlAttr("onclick")).toBe(false);
    expect(isAllowedHtmlAttr("onClick")).toBe(false);
    expect(isAllowedHtmlAttr("onerror")).toBe(false);
  });

  test("rejects React-special, style, and class keys", () => {
    expect(isAllowedHtmlAttr("dangerouslySetInnerHTML")).toBe(false);
    expect(isAllowedHtmlAttr("style")).toBe(false);
    expect(isAllowedHtmlAttr("class")).toBe(false);
    expect(isAllowedHtmlAttr("className")).toBe(false);
  });

  test("reserves the framework's data-plumix-* seam", () => {
    expect(isAllowedHtmlAttr("data-plumix-id")).toBe(false);
    expect(isAllowedHtmlAttr("data-plumix-block")).toBe(false);
  });

  test("rejects malformed names that smuggle a second attribute or markup", () => {
    expect(isAllowedHtmlAttr("data-y onmouseover=alert(1)")).toBe(false);
    expect(isAllowedHtmlAttr('data-x"><script>')).toBe(false);
    expect(isAllowedHtmlAttr("aria-label x")).toBe(false);
  });
});

describe("safeHtmlAttrs", () => {
  test("keeps allowed string attributes, drops the rest", () => {
    expect(
      safeHtmlAttrs({
        id: "hero",
        "aria-label": "Hero",
        "data-x": "1",
        onclick: "alert(1)",
        style: "color:red",
        class: "evil",
      }),
    ).toEqual({ id: "hero", "aria-label": "Hero", "data-x": "1" });
  });

  test("drops non-string values and handles undefined input", () => {
    expect(safeHtmlAttrs({ id: "ok", bad: 5 as unknown as string })).toEqual({
      id: "ok",
    });
    expect(safeHtmlAttrs(undefined)).toEqual({});
  });
});
