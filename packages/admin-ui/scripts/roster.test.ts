import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { rosterDrift, syncRoster } from "./roster.js";

const packageDir = resolve(import.meta.dirname, "..");

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

// A package with `button` and `icons` on disk, synced, so each test breaks one
// list and reads what the guard says about it.
async function syncedPackage(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "admin-ui-roster-"));
  scratch.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/button.tsx"), "export const Button = 1;\n");
  writeFileSync(join(dir, "src/icons.ts"), "export const X = 1;\n");
  writeFileSync(join(dir, "src/index.ts"), "");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", exports: {} }),
  );
  await syncRoster(dir);
  return dir;
}

function editManifest(
  dir: string,
  edit: (exports: Record<string, string>) => void,
) {
  const file = join(dir, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as {
    exports: Record<string, string>;
  };
  edit(manifest.exports);
  writeFileSync(file, JSON.stringify(manifest));
}

describe("the admin-ui component roster", () => {
  it("matches what the sync script writes", () => {
    expect(rosterDrift(packageDir)).toEqual([]);
  });

  // `plumix/admin/ui` inherits whatever the barrel holds only while it stars
  // it whole; a curated entry would be a second roster with no guard.
  it("reaches plugins through a wholesale star re-export of the barrel", () => {
    const facade = readFileSync(
      resolve(packageDir, "../plumix/src/admin/ui.ts"),
      "utf8",
    );
    expect(facade.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe(
      'export * from "@plumix/admin-ui";',
    );
  });

  it("names a module whose exports key was deleted", async () => {
    const dir = await syncedPackage();
    editManifest(dir, (exports) => {
      delete exports["./button"];
    });
    expect(rosterDrift(dir)).toEqual([
      "`button` is missing from package.json#exports",
    ]);
  });

  it("names a module whose barrel line was dropped", async () => {
    const dir = await syncedPackage();
    writeFileSync(join(dir, "src/index.ts"), "");
    expect(rosterDrift(dir)).toEqual(["`button` is missing from src/index.ts"]);
  });

  it("names a module added to src/ without a re-sync, in both lists", async () => {
    const dir = await syncedPackage();
    writeFileSync(join(dir, "src/badge.tsx"), "export const Badge = 1;\n");
    expect(rosterDrift(dir)).toEqual([
      "`badge` is missing from package.json#exports",
      "`badge` is missing from src/index.ts",
    ]);
  });

  it("names a stale entry whose module is gone", async () => {
    const dir = await syncedPackage();
    rmSync(join(dir, "src/button.tsx"));
    expect(rosterDrift(dir)).toEqual([
      "`button` is in package.json#exports but has no src/ module",
      "`button` is in src/index.ts but has no src/ module",
    ]);
  });

  it("keeps a barrel exception out of the barrel but in the exports map", async () => {
    const dir = await syncedPackage();
    expect(readFileSync(join(dir, "src/index.ts"), "utf8")).not.toContain(
      "icons",
    );
    const manifest = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports)).toEqual([".", "./button", "./icons"]);
  });

  it("is a no-op when re-run on a synced package", async () => {
    const dir = await syncedPackage();
    const before = [
      readFileSync(join(dir, "package.json"), "utf8"),
      readFileSync(join(dir, "src/index.ts"), "utf8"),
    ];
    await syncRoster(dir);
    expect([
      readFileSync(join(dir, "package.json"), "utf8"),
      readFileSync(join(dir, "src/index.ts"), "utf8"),
    ]).toEqual(before);
  });
});
