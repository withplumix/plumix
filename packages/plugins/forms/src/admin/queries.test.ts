import { afterEach, describe, expect, test, vi } from "vitest";

import { submissionsExportHref } from "./queries.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submissionsExportHref", () => {
  test("exports every submission when nothing is filtered", () => {
    expect(submissionsExportHref({}, "csv")).toBe(
      "/_plumix/forms/export?format=csv",
    );
  });

  test("carries the form and status the inbox is filtered by", () => {
    expect(
      submissionsExportHref({ form: "contact", status: "spam" }, "json"),
    ).toBe("/_plumix/forms/export?format=json&form=contact&status=spam");
  });

  test("exports under the subdirectory the site is mounted at", () => {
    vi.stubGlobal("plumix", { basePath: "/blog" });

    expect(submissionsExportHref({}, "csv")).toBe(
      "/blog/_plumix/forms/export?format=csv",
    );
  });
});
