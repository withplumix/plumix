import type { LazyRef } from "../types.js";
import type {
  MarkComponent,
  MarkRegistry,
  MarkSpec,
  ResolvedMarkSpec,
} from "./types.js";
import { MarkRegistrationError } from "./errors.js";

interface PluginContribution {
  readonly spec: MarkSpec;
  readonly pluginId: string;
}

export interface MergeMarkRegistryInput {
  readonly core: readonly MarkSpec[];
  readonly plugins: readonly PluginContribution[];
  readonly themeOverrides: Readonly<Record<string, MarkComponent>>;
  readonly themeId: string | null;
}

/**
 * Build the immutable per-app mark registry. Mirrors `mergeBlockRegistry`
 * so plugin authors only learn one mental model — deterministic theme >
 * plugin > core precedence, hard failures on duplicates / core
 * collisions / unknown overrides, awaited component lazy refs at merge
 * time so the walker reads `ResolvedMarkSpec.component` synchronously.
 *
 * The core/plugin collision check differs from the block registry's:
 * marks don't follow a `core/` namespace convention, so the check
 * compares plugin names against the core mark set rather than a string
 * prefix.
 */
export async function mergeMarkRegistry(
  input: MergeMarkRegistryInput,
): Promise<MarkRegistry> {
  validateLayerUniqueness(input);

  const merged = new Map<string, ResolvedMarkSpec>();
  for (const spec of input.core) {
    merged.set(spec.name, await resolveSpec(spec, null));
  }
  for (const { spec, pluginId } of input.plugins) {
    merged.set(spec.name, await resolveSpec(spec, pluginId));
  }
  for (const [name, component] of Object.entries(input.themeOverrides)) {
    const existing = merged.get(name);
    if (!existing) {
      throw MarkRegistrationError.themeOverrideUnknownName({
        name,
        themeId: input.themeId ?? "unknown",
      });
    }
    merged.set(name, { ...existing, component });
  }

  return Object.freeze({
    get: (name: string) => merged.get(name),
    has: (name: string) => merged.has(name),
    size: merged.size,
    [Symbol.iterator]: () => merged.entries(),
  });
}

function validateLayerUniqueness(input: MergeMarkRegistryInput): void {
  const coreNames = new Set<string>();
  for (const spec of input.core) {
    if (coreNames.has(spec.name)) {
      throw MarkRegistrationError.duplicateName({
        name: spec.name,
        layer: "core",
      });
    }
    coreNames.add(spec.name);
  }

  const pluginSeen = new Set<string>();
  for (const { spec, pluginId } of input.plugins) {
    if (coreNames.has(spec.name)) {
      throw MarkRegistrationError.coreMarkCollision({
        name: spec.name,
        registeredBy: pluginId,
      });
    }
    if (pluginSeen.has(spec.name)) {
      throw MarkRegistrationError.duplicateName({
        name: spec.name,
        layer: "plugin",
      });
    }
    pluginSeen.add(spec.name);
  }
}

async function resolveSpec(
  spec: MarkSpec,
  registeredBy: string | null,
): Promise<ResolvedMarkSpec> {
  const component = await unwrapDefault(spec.component);
  const schema = await unwrapDefault(spec.schema);
  const schemaName = (schema as { name?: unknown }).name;
  if (typeof schemaName === "string" && schemaName !== spec.name) {
    throw MarkRegistrationError.schemaNameMismatch({
      specName: spec.name,
      schemaName,
    });
  }
  return Object.freeze({ ...spec, component, registeredBy });
}

async function unwrapDefault<T>(ref: LazyRef<T>): Promise<T> {
  const resolved = await ref();
  if (
    typeof resolved === "object" &&
    resolved !== null &&
    "default" in resolved
  ) {
    return resolved.default;
  }
  return resolved;
}
