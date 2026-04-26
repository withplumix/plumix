/**
 * Contract between the admin host and plugin chunks.
 *
 * Plugin chunks load as ES modules into the admin's HTML and MUST share
 * the host's React (etc.) — duplicated React breaks hooks and contexts.
 * The seam is a browser-native importmap: admin emits each shared
 * library as a standalone ESM bundle at a stable URL and ships an
 * `<script type="importmap">` mapping the bare specifiers to those URLs.
 * Plugin authors mark the same specifiers `external` in their Vite build
 * so `import { useState } from "react"` resolves to the host's copy at
 * runtime.
 *
 * Each specifier gets its own vendor file: an importmap entry must
 * resolve to a single module that exposes the specifier's full
 * named-export API, and bundling several packages into one file would
 * force consumers to disambiguate name collisions (e.g. `react` and
 * `react/jsx-runtime` both export `Fragment`).
 *
 * The list is intentionally small. Adding to it commits us to a compat
 * surface across admin minor versions; expand only with a deliberate
 * decision and a changelog note.
 */

export interface SharedRuntimeEntry {
  readonly specifier: string;
  readonly chunk: string;
}

export const SHARED_RUNTIME_ENTRIES: readonly SharedRuntimeEntry[] = [
  { specifier: "react", chunk: "react" },
  { specifier: "react/jsx-runtime", chunk: "react-jsx-runtime" },
  { specifier: "react-dom", chunk: "react-dom" },
  { specifier: "react-dom/client", chunk: "react-dom-client" },
  { specifier: "@tanstack/react-query", chunk: "tanstack-react-query" },
  { specifier: "@tanstack/react-router", chunk: "tanstack-react-router" },
];

export const SHARED_RUNTIME_SPECIFIERS: readonly string[] =
  SHARED_RUNTIME_ENTRIES.map((e) => e.specifier);

export interface ImportMap {
  readonly imports: Readonly<Record<string, string>>;
}

export function buildSharedRuntimeImportMap(adminBasePath: string): ImportMap {
  const base = adminBasePath.endsWith("/")
    ? adminBasePath.slice(0, -1)
    : adminBasePath;
  const imports: Record<string, string> = {};
  for (const { specifier, chunk } of SHARED_RUNTIME_ENTRIES) {
    imports[specifier] = `${base}/vendor/${chunk}.js`;
  }
  return { imports };
}
