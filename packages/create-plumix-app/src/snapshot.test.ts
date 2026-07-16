import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSnapshot, loadSnapshot, serializeSnapshot } from "./snapshot.js";
import { REPO_ROOT } from "./test-support.js";

describe("buildSnapshot", () => {
  it("captures the live registry and catalog context from the workspace", async () => {
    const snapshot = await buildSnapshot(REPO_ROOT);

    expect(snapshot.registry.runtimes.map((r) => r.id)).toContain("cloudflare");
    expect(snapshot.registry.plugins.map((p) => p.id)).toContain("blog");
    expect(snapshot.catalogContext.workspaceVersions.plumix).toBeDefined();
  });

  it("inlines runtime file content so no source package is needed", async () => {
    const snapshot = await buildSnapshot(REPO_ROOT);
    const cloudflare = snapshot.registry.runtimes.find(
      (r) => r.id === "cloudflare",
    );
    expect(cloudflare?.files["wrangler.jsonc"]).toContain("d1_databases");
  });
});

describe("loadSnapshot", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-snapshot-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a serialized snapshot", async () => {
    const built = await buildSnapshot(REPO_ROOT);
    const path = join(dir, "registry.json");
    writeFileSync(path, serializeSnapshot(built));

    const loaded = await loadSnapshot(path);

    expect(loaded.registry.runtimes.map((r) => r.id)).toEqual(
      built.registry.runtimes.map((r) => r.id),
    );
    expect(loaded.catalogContext).toEqual(built.catalogContext);
  });

  it("throws a packaging error when the snapshot is absent", async () => {
    await expect(loadSnapshot(join(dir, "nope.json"))).rejects.toThrow(
      /registry snapshot/i,
    );
  });
});
