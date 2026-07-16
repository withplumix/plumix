import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSnapshot, serializeSnapshot } from "./snapshot.js";
import { loadSources } from "./sources.js";
import { REPO_ROOT } from "./test-support.js";

describe("loadSources", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-sources-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("scans the live workspace when pnpm-workspace.yaml is present", async () => {
    const { registry } = await loadSources(
      REPO_ROOT,
      join(dir, "registry.json"),
    );

    expect(registry.runtimes.map((r) => r.id)).toContain("cloudflare");
  });

  it("reads the baked snapshot when there is no workspace", async () => {
    const snapshotPath = join(dir, "registry.json");
    writeFileSync(
      snapshotPath,
      serializeSnapshot(await buildSnapshot(REPO_ROOT)),
    );

    // `dir` has no pnpm-workspace.yaml, so this is the published path.
    const { registry, ctx } = await loadSources(dir, snapshotPath);

    expect(registry.runtimes.map((r) => r.id)).toContain("cloudflare");
    expect(ctx.workspaceVersions.plumix).toBeDefined();
  });

  it("falls back to the snapshot inside a foreign pnpm workspace", async () => {
    // A user's own pnpm workspace has pnpm-workspace.yaml but no plumix
    // packages/ tree — the CLI must use the baked snapshot, not scan it.
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'app/*'\n");
    const snapshotPath = join(dir, "registry.json");
    writeFileSync(
      snapshotPath,
      serializeSnapshot(await buildSnapshot(REPO_ROOT)),
    );

    const { registry } = await loadSources(dir, snapshotPath);

    expect(registry.runtimes.map((r) => r.id)).toContain("cloudflare");
  });
});
