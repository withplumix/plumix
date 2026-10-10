// The one catalog compile: `plumix i18n compile` runs it, and so does the
// `plumix-compile-catalogs` bin that core, admin and admin-editor use — they
// sit upstream of `plumix` in the build graph, so calling it would form a
// cycle. Hand-written and shipped as-is rather than built from `src/`,
// because core compiles its own catalogs before it builds.
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATALOG_DTS =
  "export declare const messages: Record<string, string | readonly string[]>;\n";

/** @param {import("./index.d.mts").CompileCatalogsOptions} options */
export function compileCatalogs({ cwd, linguiBin, args = [], dts = false }) {
  return new Promise((resolve) => {
    // `--namespace es` emits ESM `.mjs`; without it lingui defaults to CJS
    // `.js`. No `--strict`, so missing translations fall back to source.
    // Output is captured to fail on a parse error, which lingui only warns
    // about.
    const child = spawn(
      process.execPath,
      [linguiBin, "compile", "--namespace", "es", ...args],
      { cwd, stdio: ["inherit", "pipe", "pipe"] },
    );

    let buffered = "";
    const tee = (stream, into) => {
      stream.on("data", (chunk) => {
        buffered += chunk.toString();
        into.write(chunk);
      });
    };
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);

    child.once("error", (cause) => {
      resolve({ ok: false, reason: `failed to start lingui — ${cause}` });
    });

    // `close`, not `exit`: exit can fire before the last output chunk
    // arrives, and the parse-error marker may be in it.
    child.once("close", (code, signal) => {
      if (code !== 0) {
        const detail = signal ? `signal ${signal}` : `code ${code}`;
        resolve({ ok: false, reason: `lingui exited with ${detail}` });
        return;
      }
      if (/Compilation error/.test(buffered)) {
        resolve({ ok: false, reason: "parse error in a catalog" });
        return;
      }
      // Only static-import consumers (core's admin bar resolves catalogs
      // through the package `exports` map) need declarations. Glob
      // consumers infer the type from the `.mjs` directly, and a stub
      // would clash with lingui's `Messages`.
      if (dts) {
        try {
          writeDeclarations(join(cwd, "locales"));
        } catch (cause) {
          resolve({ ok: false, reason: `could not emit .d.mts — ${cause}` });
          return;
        }
      }
      resolve({ ok: true });
    });
  });
}

function writeDeclarations(localesDir) {
  for (const file of readdirSync(localesDir)) {
    if (!file.endsWith(".mjs")) continue;
    writeFileSync(
      join(localesDir, file.replace(/\.mjs$/, ".d.mts")),
      CATALOG_DTS,
    );
  }
}

/** The calling package's own `@lingui/cli` first, so it can pin a version;
 *  core's second. `null` when neither resolves. */
export function resolveLinguiBin(cwd) {
  for (const base of [
    pathToFileURL(resolve(cwd, "package.json")).href,
    import.meta.url,
  ]) {
    try {
      const require = createRequire(base);
      return join(dirname(require.resolve("@lingui/cli")), "lingui.js");
    } catch {
      // try the next base
    }
  }
  return null;
}

/** `plumix i18n compile [--dts] [...lingui args]` as a process: the bin
 *  entry for every package that compiles catalogs, none of which needs
 *  anything built first. Sets `process.exitCode` on failure. */
export async function runCompileCatalogs(cwd, argv) {
  const linguiBin = resolveLinguiBin(cwd);
  if (linguiBin === null) {
    process.stderr.write("i18n compile: @lingui/cli not found\n");
    process.exitCode = 1;
    return;
  }
  const result = await compileCatalogs({
    cwd,
    linguiBin,
    args: argv.filter((arg) => arg !== "--dts"),
    dts: argv.includes("--dts"),
  });
  if (!result.ok) {
    process.stderr.write(`\ni18n compile: ${result.reason} — failing.\n`);
    process.exitCode = 1;
  }
}
