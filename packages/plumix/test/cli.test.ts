import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Evaluated during collection, where no per-test timeout applies; the CLI
// keeps its own import deferred for cold-start speed.
import "@plumix/core";

import packageJson from "../package.json" with { type: "json" };
import { migrateGenerateDeps } from "../src/cli/commands/migrate.js";
import { run } from "../src/cli/index.js";
import { report } from "../src/cli/report.js";

/**
 * Inline config object — avoids importing "plumix" from a tmp dir, which
 * pnpm's strict node_modules layout won't resolve.
 */
const VALID_CONFIG = `
export default {
  runtime: {
    name: "test",
    handler: {},
    generateEntry: () => "",
  },
  database: {
    kind: "test",
    connect: () => ({ db: {} }),
  },
  auth: {
    kind: "plumix",
    passkey: {
      rpName: "Test",
      rpId: "localhost",
      origin: "http://localhost:8787",
    },
  },
  // A local plugin, so the site owns a table for \`migrate generate\`.
  plugins: [{ id: "local", setup: () => {}, schemaModule: "../schema.ts" }],
  theme: { templates: () => null },
};
`;

describe("plumix CLI dispatch", () => {
  let dir: string;
  let exitCode: number | undefined;
  const originalExit: typeof process.exit = process.exit.bind(process);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-cli-dispatch-"));
    writeFileSync(join(dir, "plumix.config.mjs"), VALID_CONFIG, "utf8");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  test("migrate generate writes .plumix/site-schema.ts and invokes drizzle-kit", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockResolvedValue("");
    vi.spyOn(report, "info").mockImplementation(() => undefined);
    const success = vi
      .spyOn(report, "success")
      .mockImplementation(() => undefined);

    await run(["--cwd", dir, "migrate", "generate"]);

    const emitted = join(dir, ".plumix/site-schema.ts");
    expect(existsSync(emitted)).toBe(true);
    expect(readFileSync(emitted, "utf8")).toContain(
      'export * from "../schema.ts";',
    );
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0]?.[1]).toContain("/fake/drizzle-kit/bin.cjs");
    expect(exitCode).toBeUndefined();
    expect(success).toHaveBeenCalledWith(
      "Schema emitted: .plumix/site-schema.ts",
    );
  });

  test("unknown command throws CliError with unknown_command", async () => {
    await expect(run(["--cwd", dir, "nonsense-command"])).rejects.toMatchObject(
      { code: "unknown_command" },
    );
  });

  test("--help exits cleanly without loading a command", async () => {
    const info = vi.spyOn(report, "info").mockImplementation(() => undefined);
    await run(["--cwd", dir, "--help"]);
    expect(exitCode).toBeUndefined();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  test("doctor prints the findings the runtime's commands module diagnoses", async () => {
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      VALID_CONFIG.replace(
        'name: "test",',
        'name: "test", commandsModule: "./commands.mjs",',
      ),
    );
    writeFileSync(
      join(dir, "commands.mjs"),
      `export const diagnose = (cwd) => [
        { level: "warn", message: "Logs are off in " + cwd, fix: "Turn them on" },
      ];`,
    );
    const info = vi.spyOn(report, "info").mockImplementation(() => undefined);

    await run(["--cwd", dir, "doctor"]);

    expect(info).toHaveBeenCalledWith(`    warn  Logs are off in ${dir}`);
    expect(info).toHaveBeenCalledWith("          fix: Turn them on");
  });

  test("--version prints without requiring a config", async () => {
    const info = vi.spyOn(report, "info").mockImplementation(() => undefined);
    const emptyDir = mkdtempSync(join(tmpdir(), "plumix-cli-version-"));
    try {
      await run(["--cwd", emptyDir, "--version"]);
      expect(exitCode).toBeUndefined();
      expect(info).toHaveBeenCalledWith(packageJson.version);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
