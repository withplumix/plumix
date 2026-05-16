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
  /**
   * Optional set of registered field-type names (from `registerFieldType`).
   * When present, every block attribute's declared `type` is validated
   * against this set at merge time. When omitted (e.g. in unit tests
   * that don't care about field-type wiring), the check is skipped.
   */
  readonly fieldTypes?: ReadonlySet<string>;
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
  validateAttributeTypes(input);

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
  const schema = await unwrapDefault(spec.schema);
  // `Node.create` instances expose `.name` as the canonical schema name.
  // The spec's `name` and the Tiptap node's `name` MUST match — the
  // walker dispatches on `node.type === registry-key`, and the editor
  // builds Tiptap extensions whose names come from `schema.name`.
  // Catching the drift here is much friendlier than the walker silently
  // routing to the unknown-block fallback at render time.
  const schemaName = (schema as { name?: unknown }).name;
  if (typeof schemaName === "string" && schemaName !== spec.name) {
    throw BlockRegistrationError.schemaNameMismatch({
      specName: spec.name,
      schemaName,
    });
  }
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

function validateAttributeTypes(input: MergeBlockRegistryInput): void {
  if (!input.fieldTypes) return;
  const fieldTypes = input.fieldTypes;
  const allSpecs: readonly BlockSpec[] = [
    ...input.core,
    ...input.plugins.map((p) => p.spec),
  ];
  for (const spec of allSpecs) {
    if (!spec.attributes) continue;
    for (const [attributeName, schema] of Object.entries(spec.attributes)) {
      if (!fieldTypes.has(schema.type)) {
        throw BlockRegistrationError.unknownAttributeType({
          name: spec.name,
          attributeName,
          attributeType: schema.type,
        });
      }
    }
  }
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
