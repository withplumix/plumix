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

export const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OWN_MODULES = join(PACKAGE_ROOT, "node_modules");
export const PLUMIX_BIN = join(OWN_MODULES, ".bin/plumix");

/**
 * What the CLI is spawned with. Failure is read off its stderr, so an
 * inherited debugger banner or debug log must not reach it; the dev trust
 * gate must be able to go red on this machine.
 */
export const CLI_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_OPTIONS: undefined,
  NODE_DEBUG: undefined,
  PLUMIX_DEV_ALLOW_REMOTE: undefined,
};

/** Generate and apply the migrations for the project's `nodeSqlite()` file. */
export async function prepareDatabase(dir: string): Promise<void> {
  const run = promisify(execFile);
  await run(PLUMIX_BIN, ["migrate", "generate"], { cwd: dir, env: CLI_ENV });
  await run(PLUMIX_BIN, ["migrate", "apply"], { cwd: dir, env: CLI_ENV });
}

export const rpc = (origin: string, path: string): Promise<Response> =>
  fetch(`${origin}/_plumix/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ json: {} }),
  });

/** A stub runtime and database: enough for `migrate generate` and a client build. */
export const STUB_CONFIG = `import { auth, defineTheme, fallback, plumix } from "plumix";

export default plumix({
  runtime: { name: "stub", createHandler: () => ({ fetch: () => new Response("") }), generateEntry: () => "" },
  database: { kind: "stub", connect: () => ({ db: {} }) },
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
  configFile = "plumix.config.mjs",
): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const modules = join(dir, "node_modules");
  mkdirSync(join(modules, "@plumix"), { recursive: true });
  symlinkSync(
    realpathSync(join(OWN_MODULES, "plumix")),
    join(modules, "plumix"),
  );
  symlinkSync(PACKAGE_ROOT, join(modules, "@plumix/runtime-node"));
  symlinkSync(join(OWN_MODULES, ".bin"), join(modules, ".bin"));
  writeFileSync(join(dir, configFile), config);
  return dir;
}
