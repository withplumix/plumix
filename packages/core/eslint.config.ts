import type { Linter } from "eslint";
import type {
  DependenciesPolicy,
  FileDescriptor,
} from "eslint-plugin-boundaries";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig } from "eslint/config";

import { baseConfig } from "@plumix/eslint-config/base";

import type { Placement } from "./layers.js";
import { FOLDERS, LAYERS, TOP_FILES } from "./layers.js";

interface LayerTable {
  readonly folders: Readonly<Record<string, Placement>>;
  readonly topFiles: readonly string[];
}

const SOURCE = "{ts,tsx}";

// A table key as a glob over the package, with `src/` as its root.
function patternOf(key: string): string {
  if (key === "*/contract/") return `src/**/contract/**/*.${SOURCE}`;
  if (key.endsWith("/")) return `src/${key}**/*.${SOURCE}`;
  return `src/${key}.${SOURCE}`;
}

// A contract folder sits under its subsystem's, so it outranks every named
// folder.
function depthOf(key: string): number {
  return key === "*/contract/" ? Infinity : key.split("/").length - 1;
}

// The table lets the deepest matching folder decide, and the plugin the first
// matching descriptor, so the descriptors run `top`'s single files first and
// then deepest first.
function filesOf(table: LayerTable): FileDescriptor[] {
  const folders = Object.entries(table.folders).sort(
    ([a], [b]) => depthOf(b) - depthOf(a),
  );
  return [
    ...table.topFiles.map((file) => ({
      category: "top",
      pattern: `src/${file}`,
    })),
    ...folders.map(([key, { layer }]) => ({
      category: layer,
      pattern: patternOf(key),
    })),
  ];
}

// A file may import its own layer or one below. Everything above is
// disallowed, and `top` is above every other layer.
function policiesOf(): DependenciesPolicy[] {
  return LAYERS.slice(0, -1).map((layer, index) => ({
    from: { file: { categories: layer } },
    disallow: {
      to: { file: { categories: { anyOf: LAYERS.slice(index + 1) } } },
    },
  }));
}

/**
 * ADR 0010's direction rule, built from the layer table in `layers.ts`. The
 * graph suite (`src/layers.test.ts`) reads the same table for the rules
 * per-file lint cannot see: environment reachability and cycles.
 */
export function layerDirection(
  table: LayerTable = { folders: FOLDERS, topFiles: TOP_FILES },
): Linter.Config[] {
  return defineConfig({
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**"],
    plugins: { boundaries },
    settings: {
      // A layer is a file category rather than an element type: the plugin's
      // element descriptors match folders only, and `top` names single files.
      "boundaries/files": filesOf(table),
      // The first matching descriptor decides, as `stopMatching` on each.
      "boundaries/files-single-match": true,
      // `import type` and `export … from` count, and so does `import()`.
      "boundaries/dependency-nodes": ["import", "export", "dynamic-import"],
      // Resolves a relative `.js` specifier to its `.ts` / `.tsx` source, as
      // tsc does. Named as a package, the resolver is found on the first
      // lookup; a resolver given by path costs a failed `node_modules` walk
      // per specifier, which tripled this rule's time.
      "import/resolver": { typescript: {} },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        { default: "allow", policies: policiesOf() },
      ],
    },
  });
}

export default defineConfig(baseConfig, layerDirection());
