import { glob, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RuntimeDescriptor } from "./compose/types.js";
import { ScaffoldError } from "./errors.js";

/** The raw `plumix.scaffold` block as authored in a package's package.json. */
interface RawScaffoldMeta {
  readonly kind: "runtime" | "plugin";
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly imports?: readonly string[];
  readonly configSlots?: Record<string, string>;
  readonly authOrigin?: string;
  readonly authOriginComment?: string;
  readonly deps?: Record<string, string>;
  readonly devDeps?: Record<string, string>;
  /** dest path in the scaffolded project → source path in this package. */
  readonly files?: Record<string, string>;
}

export interface Registry {
  readonly runtimes: readonly RuntimeDescriptor[];
}

/**
 * Discover scaffoldable runtimes by scanning the workspace's runtime
 * packages for a `plumix.scaffold` block. Referenced files are read into
 * the descriptor as content, so a consumer never needs the source package
 * on disk — the same shape the published snapshot will bake.
 */
export async function loadRegistry(repoRoot: string): Promise<Registry> {
  const runtimes: RuntimeDescriptor[] = [];
  for await (const rel of glob("packages/runtimes/*/package.json", {
    cwd: repoRoot,
  })) {
    const pkgPath = join(repoRoot, rel);
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      plumix?: { scaffold?: RawScaffoldMeta };
    };
    const meta = pkg.plumix?.scaffold;
    if (meta?.kind !== "runtime") continue;
    if (!meta.label) {
      throw ScaffoldError.invalidScaffoldMeta({
        packagePath: rel,
        reason: 'missing "label"',
      });
    }
    runtimes.push(await toRuntimeDescriptor(meta, dirname(pkgPath), rel));
  }
  runtimes.sort((a, b) => a.id.localeCompare(b.id));
  return { runtimes };
}

async function toRuntimeDescriptor(
  meta: RawScaffoldMeta,
  pkgDir: string,
  rel: string,
): Promise<RuntimeDescriptor> {
  const files: Record<string, string> = {};
  for (const [dest, src] of Object.entries(meta.files ?? {})) {
    try {
      files[dest] = await readFile(join(pkgDir, src), "utf8");
    } catch {
      throw ScaffoldError.invalidScaffoldMeta({
        packagePath: rel,
        reason: `references a missing file "${src}"`,
      });
    }
  }
  return {
    id: meta.id ?? meta.label.toLowerCase(),
    label: meta.label,
    description: meta.description,
    imports: meta.imports ?? [],
    configSlots: meta.configSlots ?? {},
    authOrigin: meta.authOrigin,
    authOriginComment: meta.authOriginComment,
    deps: meta.deps ?? {},
    devDeps: meta.devDeps ?? {},
    files,
  };
}
