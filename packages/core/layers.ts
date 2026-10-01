/**
 * Core's layer table (ADR 0010): which layer each folder under `src/` belongs
 * to, and whether a browser bundle may carry it. The graph suite
 * (`src/layers.test.ts`) and the ESLint direction rule read this one module,
 * so it stays plain data and string lookups — importing it must not load
 * TypeScript or touch the file system.
 *
 * Lives outside `src/` because nothing a consumer runs may import it.
 */

export const LAYERS = [
  "foundation",
  "contracts",
  "capabilities",
  "surfaces",
  "top",
] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * Server-only when the folder's own code links drizzle, a `node:` builtin,
 * the database, the authenticator or the dispatcher; client-safe otherwise.
 * Declared per folder rather than derived, so a client-safe folder growing a
 * server link is caught as an environment violation instead of silently
 * reclassifying it.
 */
export type Environment = "client-safe" | "server-only";

export interface Placement {
  readonly layer: Layer;
  readonly environment: Environment;
}

const client = (layer: Layer): Placement => ({
  layer,
  environment: "client-safe",
});
const server = (layer: Layer): Placement => ({
  layer,
  environment: "server-only",
});

/**
 * Keys are paths under `src/`. `name/` is a folder and everything below it;
 * `*\/contract/` is any subsystem's contract folder; a key without a slash is
 * a root module, and a trailing `*` makes it every root module whose name
 * starts with that prefix. The deepest matching folder decides.
 */
export const FOLDERS: Readonly<Record<string, Placement>> = {
  "blocks/": client("foundation"),
  "i18n/": client("foundation"),
  json: client("foundation"),
  "csrf-header": client("foundation"),
  "base-path": client("foundation"),
  slugify: client("foundation"),
  "escape-html": client("foundation"),
  "css-tag": client("foundation"),
  "non-empty": client("foundation"),
  "return-url": client("foundation"),
  "read-cookie": client("foundation"),
  "document-manifest": client("foundation"),
  "document-merge": client("foundation"),
  "telemetry-snapshot": client("foundation"),
  "telemetry-otel": client("foundation"),

  "plugin/": client("contracts"),
  "hooks/": client("contracts"),
  // `stores.ts` holds the `node:async_hooks` ambient stores.
  "context/": server("contracts"),
  "config*": client("contracts"),
  "theme*": client("contracts"),
  // `template-deps-core.ts` queries through drizzle.
  "template*": server("contracts"),
  "settings-core": client("contracts"),
  // The RPC error map: capabilities throw through its constructors.
  "rpc-errors": client("contracts"),
  support: client("contracts"),
  "db/schema/": server("contracts"),
  "*/contract/": client("contracts"),

  "db/": server("capabilities"),
  "meta/": server("capabilities"),
  "access/": server("capabilities"),
  "auth/": server("capabilities"),
  "entries/": server("capabilities"),
  "terms/": server("capabilities"),
  "users/": server("capabilities"),
  "revisions/": server("capabilities"),
  "search/": server("capabilities"),
  "seo/": client("capabilities"),
  "images/": client("capabilities"),
  "storage/": client("capabilities"),
  "cdn/": client("capabilities"),
  "route/": server("capabilities"),

  "rpc/": server("surfaces"),
  "rest/": client("surfaces"),
  "mcp/": server("surfaces"),
  "admin-bar/": client("surfaces"),
  "admin/": client("surfaces"),
  "dev/": server("surfaces"),
  "dev-client/": client("surfaces"),
  "cli/": server("surfaces"),
  "welcome/": client("surfaces"),
  "welcome-theme": client("surfaces"),

  "runtime/": server("top"),
};

/**
 * The composition root's single files. The only exception to "one folder, one
 * layer": each wires or re-exports what its folder's siblings may not reach.
 */
export const TOP_FILES: readonly string[] = [
  "index.ts",
  "context/app.ts",
  "plugin/setup-context.ts",
  "db/public.ts",
  "hooks/public-hooks.ts",
];

export interface CycleUnit {
  readonly layer: Layer;
  /** Top-level folders and root files, as the cycle rule names them. */
  readonly members: readonly string[];
}

/**
 * Subsystems of one layer that the cycle rule reads as a single node, keyed
 * by the name a report gives it. `AppContext` carries the config, the hook
 * executor and the plugin registry; the plugin, template and theme handlers
 * those carry take an `AppContext`, and the hook registry reads one from the
 * ambient store. The types are mutually recursive by nature (ADR 0010). A cycle between a unit and another
 * subsystem is still a violation.
 */
export const CYCLE_UNITS: Readonly<Record<string, CycleUnit>> = {
  "app-context": {
    layer: "contracts",
    members: [
      "config.ts",
      "context",
      "hooks",
      "plugin",
      "template-deps.ts",
      "template.ts",
      "theme.ts",
    ],
  },
};

/**
 * The `exports` subpaths a browser bundle imports at runtime. The suite
 * resolves each through `package.json`, so a re-pointed subpath moves the
 * entry with it.
 */
export const CLIENT_SUBPATHS: readonly string[] = [
  "./fields",
  "./i18n",
  "./manifest",
  "./slugify",
  "./validation",
  "./support",
  "./dev-client",
  "./blocks",
  "./blocks/renderer",
  "./blocks/island-events",
  "./blocks/island-runtime",
  "./blocks/island-renderer",
];

const TOP = server("top");

function rootModuleMatches(key: string, file: string): boolean {
  const name = file.replace(/\.tsx?$/, "");
  return key.endsWith("*") ? name.startsWith(key.slice(0, -1)) : name === key;
}

function placementOf(file: string): Placement | undefined {
  if (TOP_FILES.includes(file)) return TOP;
  const segments = file.split("/");
  if (segments.length === 1) {
    const key = Object.keys(FOLDERS).find(
      (candidate) =>
        !candidate.includes("/") && rootModuleMatches(candidate, file),
    );
    return key === undefined ? undefined : FOLDERS[key];
  }
  for (let depth = segments.length - 1; depth > 0; depth--) {
    const folder = `${segments.slice(0, depth).join("/")}/`;
    const placement =
      FOLDERS[folder] ??
      (segments[depth - 1] === "contract" ? FOLDERS["*/contract/"] : undefined);
    if (placement !== undefined) return placement;
  }
  return undefined;
}

/** The layer of a file given as a posix path under `src/`. */
export function layerOf(file: string): Layer | undefined {
  return placementOf(file)?.layer;
}

/** Whether a browser bundle may carry the file at `file` (under `src/`). */
export function environmentOf(file: string): Environment | undefined {
  return placementOf(file)?.environment;
}
