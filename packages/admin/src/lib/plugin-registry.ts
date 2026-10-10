import type { Mark, Node } from "@tiptap/core";
import type { ComponentType } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";

import type { BlockSpec, JsonObject } from "@plumix/core/blocks";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { CANONICAL_INPUT_TYPES, LEGACY_INPUT_TYPES } from "@plumix/core/fields";

import { AdminPluginRegistryError } from "./errors.js";

/**
 * Not JSON: temporal fields come back as `Date`, references as hydrated rows,
 * and untouched fields hold whatever their renderer seeded.
 */
export type MetaBoxSiblingValues = Readonly<Record<string, unknown>>;

/**
 * The renderer must return a single element: `<FormControl>`'s Radix Slot
 * forwards id/aria-* onto it.
 */
interface PluginFieldRendererProps {
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: ControllerRenderProps<FieldValues, string>;
  readonly disabled: boolean;
  readonly testId: string;
  /** Block inspector only. */
  readonly attrs?: JsonObject;
  /**
   * Metabox only. On an entry it's the whole shared `meta`, so other plugins'
   * keys show too.
   */
  readonly siblings?: MetaBoxSiblingValues;
}

type PluginFieldComponent = ComponentType<PluginFieldRendererProps>;

interface PluginRegistryEntry<TComponent> {
  readonly map: Map<string, TComponent>;
  readonly registerName: string;
}

function makeRegistry<TComponent>(
  registerName: string,
): PluginRegistryEntry<TComponent> {
  return { map: new Map(), registerName };
}

const pages = makeRegistry<ComponentType>("registerPluginPage");
const dashboardWidgets = makeRegistry<ComponentType>(
  "registerPluginDashboardWidget",
);
const fieldTypes = makeRegistry<PluginFieldComponent>(
  "registerPluginFieldType",
);
const blockSchemas = makeRegistry<Node>("registerPluginBlockSchema");
const blockEditors = makeRegistry<ComponentType<unknown>>(
  "registerPluginBlockEditor",
);
const markSchemas = makeRegistry<Mark>("registerPluginMarkSchema");
const pluginBlocks = makeRegistry<BlockSpec>("registerPluginBlock");

function register<TComponent>(
  registry: PluginRegistryEntry<TComponent>,
  key: string,
  component: TComponent,
): void {
  if (registry.map.has(key)) {
    throw AdminPluginRegistryError.duplicateKey({
      registerName: registry.registerName,
      key,
    });
  }
  registry.map.set(key, component);
}

export function registerPluginPage(
  path: string,
  component: ComponentType,
): void {
  register(pages, path, component);
}

export function getPluginPage(path: string): ComponentType | undefined {
  return pages.map.get(path);
}

export function registerPluginDashboardWidget(
  id: string,
  component: ComponentType,
): void {
  register(dashboardWidgets, id, component);
}

export function getPluginDashboardWidget(
  id: string,
): ComponentType | undefined {
  return dashboardWidgets.map.get(id);
}

/**
 * Stops a plugin replacing a built-in input across the admin, by accident or to
 * harvest form data. `media` / `mediaList` are plugin-contributed, so
 * unreserved.
 */
const RESERVED_INPUT_TYPES: ReadonlySet<string> = new Set<string>([
  ...CANONICAL_INPUT_TYPES,
  ...LEGACY_INPUT_TYPES,
]);

export function registerPluginFieldType(
  type: string,
  component: PluginFieldComponent,
): void {
  if (RESERVED_INPUT_TYPES.has(type)) {
    throw AdminPluginRegistryError.inputTypeReserved({ type });
  }
  register(fieldTypes, type, component);
}

export function getPluginFieldType(
  type: string,
): PluginFieldComponent | undefined {
  return fieldTypes.map.get(type);
}

export function registerPluginBlockSchema(name: string, schema: Node): void {
  register(blockSchemas, name, schema);
}

export function getPluginBlockSchema(name: string): Node | undefined {
  return blockSchemas.map.get(name);
}

export function registerPluginBlockEditor(
  name: string,
  component: ComponentType<unknown>,
): void {
  register(blockEditors, name, component);
}

export function getPluginBlockEditor(
  name: string,
): ComponentType<unknown> | undefined {
  return blockEditors.map.get(name);
}

export function registerPluginMarkSchema(name: string, schema: Mark): void {
  register(markSchemas, name, schema);
}

export function getPluginMarkSchema(name: string): Mark | undefined {
  return markSchemas.map.get(name);
}

export function registerPluginBlock(spec: BlockSpec): void {
  // Names must include a namespace slash so first-party / third-party
  // origin is obvious in the inserter and inspector — matches the
  // `core/*`, `media/*`, `acme/*` convention.
  if (typeof spec.name !== "string" || !spec.name.includes("/")) {
    throw AdminPluginRegistryError.invalidBlockName({ name: spec.name });
  }
  // Last write wins so a theme block overrides a same-named plugin block,
  // matching the server and the canvas.
  pluginBlocks.map.set(spec.name, spec);
}

export function getRegisteredBlocks(): readonly BlockSpec[] {
  return Array.from(pluginBlocks.map.values());
}

/** @internal Test-only. */
export function _resetPluginRegistry(): void {
  pages.map.clear();
  dashboardWidgets.map.clear();
  fieldTypes.map.clear();
  blockSchemas.map.clear();
  blockEditors.map.clear();
  markSchemas.map.clear();
  pluginBlocks.map.clear();
}
