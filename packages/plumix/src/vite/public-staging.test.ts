import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { stageUserPublic } from "./public-staging.js";

describe("stageUserPublic", () => {
  let workspace: string;
  let publicDir: string;

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), "plumix-public-staging-"));
    publicDir = join(workspace, ".plumix/public");
    await mkdir(publicDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("copies workspace public/<file> into <publicDir>/<file>", async () => {
    await mkdir(join(workspace, "public"), { recursive: true });
    writeFileSync(
      join(workspace, "public/robots.txt"),
      "User-agent: *\nDisallow:\n",
      "utf8",
    );

    await stageUserPublic({ workspaceRoot: workspace, publicDir });

    const staged = readFileSync(join(publicDir, "robots.txt"), "utf8");
    expect(staged).toBe("User-agent: *\nDisallow:\n");
  });

  test("no-op when workspace public/ does not exist", async () => {
    await expect(
      stageUserPublic({ workspaceRoot: workspace, publicDir }),
    ).resolves.toBeUndefined();
  });

  test("preserves nested directory structure", async () => {
    await mkdir(join(workspace, "public/assets/icons"), { recursive: true });
    writeFileSync(
      join(workspace, "public/assets/icons/logo.svg"),
      "<svg/>",
      "utf8",
    );

    await stageUserPublic({ workspaceRoot: workspace, publicDir });

    const staged = readFileSync(
      join(publicDir, "assets/icons/logo.svg"),
      "utf8",
    );
    expect(staged).toBe("<svg/>");
  });

  test("does not copy user files under the reserved _plumix/ namespace", async () => {
    await mkdir(join(workspace, "public/_plumix/admin"), { recursive: true });
    writeFileSync(
      join(workspace, "public/_plumix/admin/index.html"),
      "<!-- user attempt to shadow admin -->",
      "utf8",
    );
    writeFileSync(join(workspace, "public/robots.txt"), "ok\n", "utf8");

    await stageUserPublic({ workspaceRoot: workspace, publicDir });

    expect(() =>
      readFileSync(join(publicDir, "_plumix/admin/index.html"), "utf8"),
    ).toThrow(/ENOENT/);
    expect(readFileSync(join(publicDir, "robots.txt"), "utf8")).toBe("ok\n");
  });
});
