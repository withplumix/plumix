#!/usr/bin/env node
// tsc prints an inferred type through whichever module it ranks best, often
// an undeclared one; annotating the export with a declared package's type
// moves it.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INTERNAL_PACKAGES = new Set([
  "@plumix/core",
  "@plumix/admin",
  "@plumix/admin-editor",
  "@plumix/admin-ui",
]);

const REFERENCE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|<reference\s+(types|path)\s*=\s*)(["'])([^"']*)\2/g;

/**
 * A comment counts only where it opens a line, as tsc writes them, so a `/*`
 * in a route pattern string swallows nothing.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function findSpecifiers(source) {
  const code = source
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/(?!\/\s*<reference).*$/gm, "");
  return [...code.matchAll(REFERENCE)].map(([, directive, , specifier = ""]) =>
    directive === "path" && !/^\.{0,2}\//.test(specifier)
      ? `./${specifier}`
      : specifier,
  );
}

/**
 * The `types` targets a manifest's `exports` publishes.
 *
 * @param {unknown} exports
 * @returns {string[]}
 */
function typesTargets(exports) {
  if (exports === null || typeof exports !== "object") return [];
  return Object.entries(exports).flatMap(([key, value]) =>
    key === "types" && typeof value === "string"
      ? [value]
      : typesTargets(value),
  );
}

/**
 * A `*` matches across directories, as Node's pattern does.
 *
 * @param {string} dir
 * @param {string} target
 * @returns {string[]}
 */
function expandTarget(dir, target) {
  const path = join(dir, target);
  const star = path.indexOf("*");
  if (star === -1) return existsSync(path) ? [path] : [];
  const prefix = path.slice(0, star);
  const suffix = path.slice(star + 1);
  const root = dirname(prefix + "x");
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (file) =>
        file.startsWith(prefix) &&
        file.endsWith(suffix) &&
        file.length >= prefix.length + suffix.length,
    );
}

/**
 * No package declares platform modules; the app supplies their types.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
function isPlatformModule(specifier) {
  return specifier === "bun" || /^[a-z][a-z0-9+.-]*:/i.test(specifier);
}

/**
 * The package a bare specifier names: `@scope/pkg/sub` and `pkg/sub` count by
 * `@scope/pkg` and `pkg`.
 *
 * @param {string} specifier
 * @returns {string}
 */
function packageName(specifier) {
  const segments = specifier.split("/");
  return segments.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

/**
 * @param {string} from
 * @param {string} specifier
 * @returns {string | undefined}
 */
function resolveDeclaration(from, specifier) {
  const base = resolve(dirname(from), specifier);
  const extension = /\.([cm]?)js$/.exec(base);
  if (/\.d\.[cm]?ts$/.test(base)) return existsSync(base) ? base : undefined;
  const candidates = extension
    ? [`${base.slice(0, extension.index)}.d.${extension[1]}ts`]
    : [`${base}.d.ts`, join(base, "index.d.ts")];
  return candidates.find((path) => existsSync(path));
}

/**
 * A devDependency is not installed for a consumer, so only dependencies and
 * peers count as declared.
 *
 * @param {string} dir
 * @returns {{ file: string; specifiers: string[] }[]}
 */
export function checkDeclarations(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const loadable = new Set(
    [
      ...typesTargets({ types: manifest.types }),
      ...typesTargets(manifest.exports),
    ].flatMap((target) => expandTarget(dir, target)),
  );
  /** @type {{ file: string; specifiers: string[] }[]} */
  const leaks = [];
  for (const path of loadable) {
    /** @type {Set<string>} */
    const undeclared = new Set();
    for (const specifier of findSpecifiers(readFileSync(path, "utf8"))) {
      if (specifier.startsWith(".")) {
        const next = resolveDeclaration(path, specifier);
        if (next !== undefined) loadable.add(next);
      } else if (
        !isPlatformModule(specifier) &&
        !declared.has(packageName(specifier))
      ) {
        undeclared.add(specifier);
      }
    }
    if (undeclared.size > 0) {
      leaks.push({ file: relative(dir, path), specifiers: [...undeclared] });
    }
  }
  return leaks.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The failure message for `leaks`: each file with its specifiers, then how to
 * fix the kind of package they name.
 *
 * @param {{ file: string; specifiers: string[] }[]} leaks
 * @returns {string}
 */
export function describeLeaks(leaks) {
  const named = leaks.flatMap((leak) => leak.specifiers).map(packageName);
  return [
    "Declarations a consumer can load name packages this package does not declare:",
    ...leaks.map(
      ({ file, specifiers }) => `  ${file}: ${specifiers.join(", ")}`,
    ),
    ...(named.some((name) => INTERNAL_PACKAGES.has(name))
      ? [
          "Annotate the export with the type from a `plumix` subpath, or publish the type on one.",
        ]
      : []),
    ...(named.some((name) => !INTERNAL_PACKAGES.has(name))
      ? [
          "Annotate the export with a type from a package this one declares. Declaring a package no source file imports is not the fix: knip then calls it unused without a build.",
        ]
      : []),
  ].join("\n");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const leaks = checkDeclarations(resolve(process.argv[2] ?? "."));
  if (leaks.length > 0) {
    console.error(describeLeaks(leaks));
    process.exit(1);
  }
}
