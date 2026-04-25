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
 * Each specifier gets its own vendor file rather than being grouped:
 * an importmap entry must resolve to a single module that exposes the
 * specifier's full named-export API, and bundling several packages into
 * one file would force consumers to disambiguate name collisions
 * (e.g. `react` and `react/jsx-runtime` both export `Fragment`).
 *
 * The list is intentionally small. Adding to it commits us to a compat
 * surface across admin minor versions; expand only with a deliberate
 * decision and a changelog note.
 */

interface SharedRuntimeEntry {
  /** Bare specifier the consumer writes (`import x from <here>`). */
  readonly specifier: string;
  /** Stable filename (without extension) under `${adminBasePath}/vendor/`. */
  readonly chunk: string;
}

const SHARED_RUNTIME_ENTRIES: readonly SharedRuntimeEntry[] = [
  { specifier: "react", chunk: "react" },
  { specifier: "react/jsx-runtime", chunk: "react-jsx-runtime" },
  { specifier: "react-dom", chunk: "react-dom" },
  { specifier: "react-dom/client", chunk: "react-dom-client" },
  { specifier: "@tanstack/react-query", chunk: "tanstack-react-query" },
  { specifier: "@tanstack/react-router", chunk: "tanstack-react-router" },
];

export type SharedRuntimeSpecifier =
  (typeof SHARED_RUNTIME_ENTRIES)[number]["specifier"];

export const SHARED_RUNTIME_SPECIFIERS: readonly string[] =
  SHARED_RUNTIME_ENTRIES.map((e) => e.specifier);

/**
 * Specifier → vendor chunk filename (without extension). Consumed by
 * the admin's vendor build step to know which entry files to emit and
 * what to name them.
 */
export const SHARED_RUNTIME_CHUNK_NAMES: Readonly<Record<string, string>> =
  Object.fromEntries(SHARED_RUNTIME_ENTRIES.map((e) => [e.specifier, e.chunk]));

export interface ImportMap {
  readonly imports: Readonly<Record<string, string>>;
}

/**
 * Build the importmap the admin's HTML serves. `adminBasePath` is the
 * URL prefix the admin mounts at (e.g. `/_plumix/admin`); vendor chunks
 * live at `${adminBasePath}/vendor/${chunk}.js`. Pure so the admin's
 * build can inline the map and tests can assert the wire shape.
 */
export function buildSharedRuntimeImportMap(adminBasePath: string): ImportMap {
  const base = adminBasePath.replace(/\/+$/, "");
  const imports: Record<string, string> = {};
  for (const { specifier, chunk } of SHARED_RUNTIME_ENTRIES) {
    imports[specifier] = `${base}/vendor/${chunk}.js`;
  }
  return { imports };
}
