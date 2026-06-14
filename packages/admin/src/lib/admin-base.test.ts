import { afterEach, describe, expect, test } from "vitest";

import { adminBasePath } from "./admin-base.js";

function setBaseHref(href: string | null): void {
  document.head.innerHTML = href ? `<base href="${href}">` : "";
}

afterEach(() => {
  document.head.innerHTML = "";
});

describe("adminBasePath", () => {
  test("no <base> tag → root deployment", () => {
    setBaseHref(null);
    expect(adminBasePath()).toBe("");
  });

  test("root mount → empty base path", () => {
    setBaseHref("/_plumix/admin/");
    expect(adminBasePath()).toBe("");
  });

  test("subdirectory mount → the subdirectory prefix", () => {
    setBaseHref("/custom-directory/_plumix/admin/");
    expect(adminBasePath()).toBe("/custom-directory");
  });

  test("nested subdirectory mount", () => {
    setBaseHref("/a/b/_plumix/admin/");
    expect(adminBasePath()).toBe("/a/b");
  });
});
