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

export const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OWN_MODULES = join(PACKAGE_ROOT, "node_modules");
export const PLUMIX_BIN = join(OWN_MODULES, ".bin/plumix");

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
  writeFileSync(join(dir, "plumix.config.mjs"), config);
  return dir;
}
