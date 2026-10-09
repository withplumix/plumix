import { describe, expect, it } from "vitest";

import type { PluginDescriptor, RuntimeDescriptor } from "./compose/types.js";
import type { Registry } from "./registry.js";
import { loadRegistry } from "./registry.js";
import { planBoot, planInstall, planSmokeCombos } from "./smoke-plan.js";
import { REPO_ROOT } from "./test-support.js";

function runtime(
  id: string,
  extra: Partial<RuntimeDescriptor> = {},
): RuntimeDescriptor {
  return {
    id,
    label: id,
    imports: [],
    configSlots: {},
    deps: {},
    devDeps: {},
    secretsFile: ".env",
    files: {},
    ...extra,
  };
}

function plugin(
  id: string,
  extra: Partial<PluginDescriptor> = {},
): PluginDescriptor {
  return { id, label: id, registration: `${id}()`, deps: {}, ...extra };
}

describe("planSmokeCombos", () => {
  it("installs every combo with its runtime's declared package manager, pnpm when it declares none", () => {
    const registry: Registry = {
      runtimes: [runtime("bun", { packageManager: "bun" }), runtime("node")],
      plugins: [],
    };

    const managers = Object.fromEntries(
      planSmokeCombos(registry).map((combo) => [
        combo.name,
        combo.packageManager,
      ]),
    );

    expect(managers).toEqual({
      "bun-blank": "bun",
      "bun-all-plugins": "bun",
      "bun-all-auth": "bun",
      "bun-typescript-7": "bun",
      "node-blank": "pnpm",
      "node-all-plugins": "pnpm",
      "node-all-auth": "pnpm",
      "node-typescript-7": "pnpm",
    });
  });

  it("leaves out a plugin whose capability the runtime lacks, and says so", () => {
    const registry: Registry = {
      runtimes: [
        runtime("node", { capabilities: { storage: {} } }),
        runtime("edge"),
      ],
      plugins: [plugin("blog"), plugin("media", { requires: ["storage"] })],
    };

    const allPlugins = planSmokeCombos(registry).filter((combo) =>
      combo.name.endsWith("-all-plugins"),
    );

    expect(allPlugins).toMatchObject([
      {
        name: "node-all-plugins",
        args: ["-y", "--runtime", "node", "-p", "blog,media"],
        excluded: [],
      },
      {
        name: "edge-all-plugins",
        args: ["-y", "--runtime", "edge", "-p", "blog"],
        excluded: ["media"],
      },
    ]);
  });
});

describe("planSmokeCombos — the workspace's runtimes", () => {
  it("runs Bun's combos on bun, with media among its plugins now Bun delivers images", async () => {
    const combos = planSmokeCombos(await loadRegistry(REPO_ROOT));

    expect(combos.find((combo) => combo.name === "bun-blank")).toMatchObject({
      packageManager: "bun",
    });
    const allPlugins = combos.find((combo) => combo.name === "bun-all-plugins");
    expect(allPlugins).toMatchObject({ packageManager: "bun" });
    expect(allPlugins?.excluded).toEqual([]);
    expect(allPlugins?.args.join(" ")).toMatch(/\bmedia\b/);
  });
});

describe("planInstall", () => {
  const tarballs = new Map([
    ["plumix", "/packs/plumix-0.24.0.tgz"],
    ["@plumix/runtime-node", "/packs/plumix-runtime-node-0.3.0.tgz"],
  ]);
  const redirected = {
    plumix: "file:/packs/plumix-0.24.0.tgz",
    "@plumix/runtime-node": "file:/packs/plumix-runtime-node-0.3.0.tgz",
  };

  it("redirects pnpm through the project's own pnpm-workspace.yaml overrides", () => {
    expect(planInstall("pnpm", tarballs)).toEqual({
      workspaceOverrides: redirected,
      command: ["pnpm", "install", "--silent"],
    });
  });

  it("redirects Bun through the top-level overrides field it honours", () => {
    expect(planInstall("bun", tarballs)).toEqual({
      manifest: { overrides: redirected },
      command: ["bun", "install", "--silent"],
    });
  });
});

describe("planBoot", () => {
  it("migrates through the runtime's cli prefix, then starts its start command", () => {
    expect(
      planBoot("@plumix/runtime-bun", {
        cli: "bun --bun node_modules/plumix/bin/plumix.mjs",
        start: "bun dist/server/worker.js",
      }),
    ).toEqual({
      migrate: ["bun --bun node_modules/plumix/bin/plumix.mjs migrate"],
      start: "bun dist/server/worker.js",
    });
  });

  it("runs the package's own plumix bin when the runtime names no cli", () => {
    expect(
      planBoot("@plumix/runtime-node", { start: "node dist/server/worker.js" })
        .migrate,
    ).toEqual(["plumix migrate"]);
  });

  it("applies migrations to the local database the started server reads, never a remote one", () => {
    const { migrate } = planBoot("@plumix/runtime-cloudflare", {
      start: "wrangler dev --local",
    });

    expect(migrate).toEqual(["plumix migrate"]);
  });

  it("refuses a runtime that declares no start command, rather than skip its boot", () => {
    expect(() => planBoot("@plumix/runtime-edge", {})).toThrow(
      /@plumix\/runtime-edge declares no "plumix\.e2e\.start"/,
    );
  });
});
