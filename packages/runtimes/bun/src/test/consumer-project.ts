import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OWN_MODULES = join(PACKAGE_ROOT, "node_modules");

// The bin's own script, not the `.bin` shim: pnpm writes that as a shell
// script, which `bun --bun` cannot execute.
export const PLUMIX_SCRIPT = join(
  realpathSync(join(OWN_MODULES, "plumix")),
  "bin/plumix.mjs",
);

/**
 * What the CLI is spawned with. `pnpm exec` sets `NODE_PATH` to the hoisted
 * store, through which a fixture would resolve packages it never installed.
 */
export const CLI_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_OPTIONS: undefined,
  NODE_PATH: undefined,
};

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `plumix <args>` in `cwd` on the named runtime: `bun --bun`, or `node`. */
export async function plumixOn(
  runtime: "bun" | "node",
  cwd: string,
  args: readonly string[],
): Promise<CliResult> {
  const [command, ...prefix] =
    runtime === "bun"
      ? ["bun", "--bun", PLUMIX_SCRIPT]
      : ["node", PLUMIX_SCRIPT];
  try {
    const { stdout, stderr } = await promisify(execFile)(
      command,
      [...prefix, ...args],
      { cwd, env: CLI_ENV },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

export const rpc = (origin: string, path: string): Promise<Response> =>
  fetch(`${origin}/_plumix/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ json: {} }),
  });

/** A config naming this package's adapter and `bunSqlite()` on a relative path. */
export const BUN_CONFIG = `import { auth } from "plumix/auth";
import { defineTheme, fallback } from "plumix/theme";
import { plumix } from "plumix";
import { bun, bunSqlite } from "@plumix/runtime-bun";

export default plumix({
  runtime: bun(),
  database: bunSqlite({ path: "data/site.sqlite" }),
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
});
`;

/**
 * A consumer project in a temp dir. Its `node_modules` is a real directory of
 * links, so `plumix` and this package resolve from there the way they do from
 * an app root.
 */
export function scaffoldConsumerProject(
  prefix: string,
  config: string,
): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const modules = join(dir, "node_modules");
  mkdirSync(join(modules, "@plumix"), { recursive: true });
  symlinkSync(
    realpathSync(join(OWN_MODULES, "plumix")),
    join(modules, "plumix"),
  );
  symlinkSync(PACKAGE_ROOT, join(modules, "@plumix/runtime-bun"));
  writeFileSync(join(dir, "plumix.config.mjs"), config);
  return dir;
}
