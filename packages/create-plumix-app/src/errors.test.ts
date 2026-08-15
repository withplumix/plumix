import { describe, expect, test } from "vitest";

import { ScaffoldError } from "./errors.js";

describe("ScaffoldError.targetParentMissing", () => {
  test("class identity, code, and message carrying the parent", () => {
    const err = ScaffoldError.targetParentMissing({ parent: "/missing/dir" });
    expect(err).toBeInstanceOf(ScaffoldError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ScaffoldError");
    expect(err.code).toBe("target_parent_missing");
    expect(err.message).toContain(
      "Target parent directory does not exist: /missing/dir",
    );
  });
});

describe("ScaffoldError.targetNotDirectory", () => {
  test("code and message carrying the target", () => {
    const err = ScaffoldError.targetNotDirectory({ targetDir: "/path/file" });
    expect(err.name).toBe("ScaffoldError");
    expect(err.code).toBe("target_not_directory");
    expect(err.message).toContain(
      "Target path exists but is not a directory: /path/file",
    );
  });
});

describe("ScaffoldError.targetDirectoryNotEmpty", () => {
  test("code and message carrying the target", () => {
    const err = ScaffoldError.targetDirectoryNotEmpty({
      targetDir: "/path/existing",
    });
    expect(err.code).toBe("target_directory_not_empty");
    expect(err.message).toContain(
      "Target directory is not empty: /path/existing",
    );
  });
});

describe("ScaffoldError.catalogResolutionMissing", () => {
  test("code and message carrying dependency and catalog", () => {
    const err = ScaffoldError.catalogResolutionMissing({
      dependency: "react-dom",
      catalog: "react",
    });
    expect(err.code).toBe("catalog_resolution_missing");
    expect(err.message).toContain('"react-dom"');
    expect(err.message).toContain('"react" catalog');
    expect(err.message).toContain("pnpm-workspace.yaml");
  });
});

describe("ScaffoldError.workspaceVersionMissing", () => {
  test("code and message carrying the package name", () => {
    const err = ScaffoldError.workspaceVersionMissing({
      packageName: "@plumix/ghost",
    });
    expect(err.code).toBe("workspace_version_missing");
    expect(err.message).toContain('No workspace version for "@plumix/ghost"');
    expect(err.message).toContain("workspace:");
  });
});
