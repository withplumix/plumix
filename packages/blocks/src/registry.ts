import type {
  BlockComponent,
  BlockRegistry,
  BlockSpec,
  LazyRef,
  ResolvedBlockSpec,
} from "./types.js";
import { BlockRegistrationError } from "./errors.js";

const CORE_NAMESPACE_PREFIX = "core/";

interface PluginContribution {
  readonly spec: BlockSpec;
  readonly pluginId: string;
}

export interface MergeBlockRegistryInput {
  readonly core: readonly BlockSpec[];
  readonly plugins: readonly PluginContribution[];
  readonly themeOverrides: Readonly<Record<string, BlockComponent>>;
  readonly themeId: string | null;
}

/**
 * Build the immutable per-app block registry from the three contribution
 * layers, with deterministic precedence theme > plugin > core.
 *
 * Hard failures (thrown synchronously, before any async work):
 * - duplicate name within any single layer;
 * - plugin spec with a `core/` namespace;
 * - theme override targeting a name no layer registered.
 *
 * Theme overrides only replace the resolved spec's `component` — the
 * schema, attributes, and editor are owned by the block author and
 * cannot be swapped by a theme without invalidating stored content.
 *
 * Async because each spec's `component` lazy ref is awaited once at
 * boot; afterwards the walker reads `registry.get(name).component`
 * synchronously, matching React SSR's render contract.
 */
export async function mergeBlockRegistry(
  input: MergeBlockRegistryInput,
): Promise<BlockRegistry> {
  validateLayerUniqueness(input);

  const merged = new Map<string, ResolvedBlockSpec>();
  const aliases = new Map<string, string>();

  for (const spec of input.core) {
    const resolved = await resolveSpec(spec, null);
    merged.set(spec.name, resolved);
    indexAliases(spec, aliases);
  }
  for (const { spec, pluginId } of input.plugins) {
    const resolved = await resolveSpec(spec, pluginId);
    merged.set(spec.name, resolved);
    indexAliases(spec, aliases);
  }
  for (const [name, component] of Object.entries(input.themeOverrides)) {
    const existing = merged.get(name);
    if (!existing) {
      throw BlockRegistrationError.themeOverrideUnknownName({
        name,
        themeId: input.themeId ?? "unknown",
      });
    }
    merged.set(name, { ...existing, component });
  }

  const get = (name: string): ResolvedBlockSpec | undefined => {
    const direct = merged.get(name);
    if (direct) return direct;
    const canonical = aliases.get(name);
    return canonical === undefined ? undefined : merged.get(canonical);
  };

  return Object.freeze({
    get,
    has: (name: string) => get(name) !== undefined,
    size: merged.size,
    [Symbol.iterator]: () => merged.entries(),
  });
}

function validateLayerUniqueness(input: MergeBlockRegistryInput): void {
  const coreSeen = new Set<string>();
  for (const spec of input.core) {
    if (coreSeen.has(spec.name)) {
      throw BlockRegistrationError.duplicateName({
        name: spec.name,
        layer: "core",
      });
    }
    coreSeen.add(spec.name);
  }

  const pluginSeen = new Set<string>();
  for (const { spec, pluginId } of input.plugins) {
    if (spec.name.startsWith(CORE_NAMESPACE_PREFIX)) {
      throw BlockRegistrationError.coreBlockCollision({
        name: spec.name,
        registeredBy: pluginId,
      });
    }
    if (pluginSeen.has(spec.name)) {
      throw BlockRegistrationError.duplicateName({
        name: spec.name,
        layer: "plugin",
      });
    }
    pluginSeen.add(spec.name);
  }
}

async function resolveSpec(
  spec: BlockSpec,
  registeredBy: string | null,
): Promise<ResolvedBlockSpec> {
  const component = await unwrapDefault(spec.component);
  return Object.freeze({
    name: spec.name,
    title: spec.title,
    icon: spec.icon,
    category: spec.category,
    description: spec.description,
    keywords: spec.keywords,
    attributes: spec.attributes,
    schema: spec.schema,
    editor: spec.editor,
    client: spec.client,
    component,
    registeredBy,
  });
}

function indexAliases(spec: BlockSpec, aliases: Map<string, string>): void {
  if (!spec.legacyAliases) return;
  for (const alias of spec.legacyAliases) {
    aliases.set(alias, spec.name);
  }
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
