#!/usr/bin/env node
// Fails a consumer package's build when its emitted declarations reach into an
// internal `@plumix/*` package. A consumer depends on `plumix` alone, so a
// `.d.ts` naming `@plumix/core` resolves nowhere once published.
//
// The compiler writes these without being asked: an inferred type prints
// through whichever module it ranks best, and it ranks `@plumix/core` level
// with `plumix/plugin` because both are one path segment deep. Annotating the
// export with the façade type, or publishing the type on a façade subpath that
// does not carry it yet, is what moves the output.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INTERNAL_PACKAGES = [
  "@plumix/core",
  "@plumix/blocks",
  "@plumix/admin",
  "@plumix/admin-editor",
  "@plumix/admin-ui",
];

const INTERNAL = INTERNAL_PACKAGES.join("|").replaceAll("/", "\\/");
const REFERENCE = new RegExp(
  `(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|<reference\\s+types\\s*=\\s*)(["'])((?:${INTERNAL})(?:\\/[^"']*)?)\\1`,
  "g",
);

/**
 * The internal specifiers a declaration file's code refers to, in order.
 * Comments are dropped first so a doc example cannot trip it; triple-slash
 * directives are code to the compiler and survive. A comment only counts where
 * it opens a line, which is where tsc writes every one — a `/*` inside a route
 * pattern string must not swallow the declarations after it.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function findInternalSpecifiers(source) {
  const code = source
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/(?!\/\s*<reference).*$/gm, "");
  return [...code.matchAll(REFERENCE)].map((match) => match[2] ?? "");
}

/**
 * Every declaration file under `dir` that refers to an internal package, with
 * paths relative to `dir`.
 *
 * @param {string} dir
 * @returns {{ file: string; specifiers: string[] }[]}
 */
export function checkDeclarations(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.d\.[cm]?ts$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .flatMap((path) => {
      const specifiers = findInternalSpecifiers(readFileSync(path, "utf8"));
      return specifiers.length === 0
        ? []
        : [{ file: relative(dir, path), specifiers: [...new Set(specifiers)] }];
    });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const dir = resolve(process.argv[2] ?? "dist");
  const leaks = checkDeclarations(dir);
  if (leaks.length > 0) {
    console.error(
      `Declarations in ${relative(process.cwd(), dir) || "."} name internal packages a consumer cannot resolve:`,
    );
    for (const { file, specifiers } of leaks) {
      console.error(`  ${file}: ${specifiers.join(", ")}`);
    }
    console.error(
      "Annotate the export with the type from a `plumix` subpath, or publish the type on one.",
    );
    process.exit(1);
  }
}
