import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
import { describe, expect, test } from "vitest";

import manifest from "../package.json" with { type: "json" };

const SRC = fileURLToPath(new URL(".", import.meta.url));

function runtimeModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return runtimeModules(path);
    return /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
      ? [path]
      : [];
  });
}

// A type-only import or export is erased from the emitted JS, so it asks
// nothing of a consumer's install; everything else survives into dist.
function runtimeSpecifiers(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const { program, module } = parseSync(path, source);
  const statics = program.body.flatMap((statement) => {
    if (statement.type === "ImportDeclaration") {
      return statement.importKind === "type" ? [] : [statement.source.value];
    }
    if (
      statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportAllDeclaration"
    ) {
      return statement.exportKind === "type" || !statement.source
        ? []
        : [statement.source.value];
    }
    return [];
  });
  const dynamics = module.dynamicImports.flatMap(({ moduleRequest }) => {
    const literal = /^(["'])(.*)\1$/.exec(
      source.slice(moduleRequest.start, moduleRequest.end),
    );
    return literal?.[2] === undefined ? [] : [literal[2]];
  });
  return [...statics, ...dynamics];
}

function packageName(specifier: string): string | undefined {
  if (/^(\.|\/|#|node:|virtual:)/.test(specifier)) return undefined;
  const [scope, name] = specifier.split("/");
  const pkg = specifier.startsWith("@") ? `${scope}/${name}` : scope;
  return builtinModules.includes(pkg ?? "") ? undefined : pkg;
}

describe("plumix runtime dependencies", () => {
  test("every package a shipped module imports is declared for the consumer's install", () => {
    const declared = new Set([
      manifest.name,
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ]);
    const undeclared = runtimeModules(SRC).flatMap((path) =>
      runtimeSpecifiers(path)
        .map(packageName)
        .filter((pkg) => pkg !== undefined && !declared.has(pkg))
        .map((pkg) => `${relative(SRC, path)} -> ${pkg}`),
    );
    expect(undeclared).toEqual([]);
  });
});
