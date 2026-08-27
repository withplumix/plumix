import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Selection } from "./compose/types.js";
import { assembleConfig } from "./compose/config.js";
import { resolveContributions } from "./compose/contributions.js";
import { assembleRuntimeFiles } from "./compose/files.js";
import { loadRegistry } from "./registry.js";
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

describe("live cloudflare runtime capabilities", () => {
  it("advertises a kv capability wiring kv({ binding }) + a KV namespace", async () => {
    const registry = await loadRegistry(REPO_ROOT);
    const cloudflare = registry.runtimes.find((r) => r.id === "cloudflare");
    const kv = cloudflare?.capabilities?.kv;

    expect(kv?.imports).toContain(
      'import { kv } from "@plumix/runtime-cloudflare";',
    );
    expect(kv?.configSlots?.kv).toBe('kv({ binding: "KV" })');
    expect(kv?.wrangler?.kv_namespaces).toEqual([
      { binding: "KV", id: "local-development-only" },
    ]);
  });
});

describe("live og plugin descriptor", () => {
  const liveOg = async () => (await loadRegistry(REPO_ROOT)).plugins;

  it("registers og() against a storage requirement and nothing else", async () => {
    const og = (await liveOg()).find((p) => p.id === "og");

    expect(og?.registration).toBe("og()");
    expect(og?.imports).toContain('import { og } from "@plumix/plugin-og";');
    expect(og?.deps["@plumix/plugin-og"]).toBeDefined();
    // Media asks for `imageDelivery` beside storage; a card needs no delivery
    // slot, so the two descriptors have to stay distinguishable.
    expect(og?.requires).toEqual(["storage"]);
  });

  it("composes the bucket a rendered card is kept in", async () => {
    const registry = await loadRegistry(REPO_ROOT);
    const runtime = registry.runtimes.find((r) => r.id === "cloudflare");
    const og = registry.plugins.find((p) => p.id === "og");
    if (!runtime || !og) throw new Error("cloudflare or og is not offered");

    const selection: Selection = {
      projectName: "my-app",
      runtime,
      plugins: [og],
      authMethods: [],
    };
    const contributions = resolveContributions(selection);
    const config = assembleConfig(selection, contributions);
    const wrangler = assembleRuntimeFiles(selection, contributions.wrangler)[
      "wrangler.jsonc"
    ];

    expect(config).toContain("og(),");
    // Without the slot every request renders the card again, so the storage
    // requirement has to reach both the config and the binding behind it.
    expect(config).toContain('storage: r2({ binding: "MEDIA" }),');
    expect(wrangler).toContain('"bucket_name": "my-app-media"');
  });
});
