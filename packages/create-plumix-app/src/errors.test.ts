import { describe, expect, test } from "vitest";

import { ScaffoldError } from "./errors.js";

describe("ScaffoldError.targetParentMissing", () => {
  test("class identity, code, exposed parent, and message", () => {
    const err = ScaffoldError.targetParentMissing({ parent: "/missing/dir" });
    expect(err).toBeInstanceOf(ScaffoldError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ScaffoldError");
    expect(err.code).toBe("target_parent_missing");
    expect(err.parent).toBe("/missing/dir");
    expect(err.message).toContain(
      "Target parent directory does not exist: /missing/dir",
    );
  });
});

describe("ScaffoldError.targetNotDirectory", () => {
  test("class identity, code, exposed targetDir, and message", () => {
    const err = ScaffoldError.targetNotDirectory({ targetDir: "/path/file" });
    expect(err.name).toBe("ScaffoldError");
    expect(err.code).toBe("target_not_directory");
    expect(err.targetDir).toBe("/path/file");
    expect(err.message).toContain(
      "Target path exists but is not a directory: /path/file",
    );
  });
});

describe("ScaffoldError.targetDirectoryNotEmpty", () => {
  test("class identity, code, exposed targetDir, and message", () => {
    const err = ScaffoldError.targetDirectoryNotEmpty({
      targetDir: "/path/existing",
    });
    expect(err.code).toBe("target_directory_not_empty");
    expect(err.targetDir).toBe("/path/existing");
    expect(err.message).toContain(
      "Target directory is not empty: /path/existing",
    );
  });
});

describe("ScaffoldError.catalogResolutionMissing", () => {
  test("class identity, code, exposed catalogName, and message", () => {
    const err = ScaffoldError.catalogResolutionMissing({
      catalogName: "react-dom",
    });
    expect(err.code).toBe("catalog_resolution_missing");
    expect(err.catalogName).toBe("react-dom");
    expect(err.message).toContain('No catalog resolution for "react-dom"');
    expect(err.message).toContain("CATALOG_RESOLUTIONS in scaffold.ts");
  });
});
