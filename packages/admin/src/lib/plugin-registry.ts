import type { Mark, Node } from "@tiptap/core";
import type { ComponentType } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";

import type { BlockSpec, JsonObject } from "@plumix/blocks";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { CANONICAL_INPUT_TYPES, LEGACY_INPUT_TYPES } from "@plumix/core/fields";

import { AdminPluginRegistryError } from "./errors.js";

/**
 * One meta box's field values as react-hook-form holds them, keyed by field
 * key.
 *
 * Not JSON: a resolved meta bag hands a temporal field back as a `Date` and a
 * reference as its hydrated row, and a field the author has not touched yet
 * holds whatever its renderer seeded — so every value is unproven until read.
 */
export type MetaBoxSiblingValues = Readonly<Record<string, unknown>>;

/**
 * Contract for plugin-supplied field renderers. The admin's
 * `MetaBoxField` dispatcher resolves the renderer via
 * `getPluginFieldType(field.inputType)` and hands it the field
 * manifest entry plus a react-hook-form controller binding. The
 * renderer must return a single element — shadcn's `<FormControl>`
 * uses Radix `Slot` to forward id/aria-* onto it.
 *
 * Internal — plugin authors register components against
 * `window.plumix.registerPluginFieldType` at runtime; the host
 * exposes that bridge from `plumix-globals.ts`. Plugins type their
 * own props inline.
 */
interface PluginFieldRendererProps {
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: ControllerRenderProps<FieldValues, string>;
  readonly disabled: boolean;
  readonly testId: string;
  /** The active block's other attributes when rendered in the block inspector
   *  (a sibling-aware control like the focal-point picker reads the image url);
   *  absent in the metabox context, which has `siblings` instead. */
  readonly attrs?: JsonObject;
  /** The other values in the bag this field's box binds to, live — what a
   *  preview control reads to update as the author types in the fields beside
   *  it. On an entry that bag is the entity's whole `meta`, which every box on
   *  it shares, so a renderer sees other plugins' keys too. Absent in the block
   *  inspector, which has `attrs`. */
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

// Built-in `inputType` names handled by the host's meta-box-field
// dispatcher. Reserving them prevents two failure modes:
//  - accidental: a plugin author picks "text" for their custom field
//    and silently replaces the host's text input across the whole admin
//  - malicious: a plugin overrides every built-in to harvest form data
//
// Derived from the single field-type roster in `core` (the canonical
// families plus the retired legacy family) rather than hand-listed, so it
// can never drift from the union again. `media` / `mediaList` are NOT
// roster members — they are plugin-contributed reference kinds whose own
// admin renderers register through this very seam, so they stay unreserved
// (the duplicate-detection in `register` still stops two plugins claiming
// the same name).
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
  // Last-write-wins on a duplicate name — unlike the other registries, blocks
  // tolerate re-registration so a theme block overrides a same-named plugin
  // block (blocks are collected plugin-first, theme-last) instead of crashing
  // the admin. Matches the server (`createBlockRegistry`) and the canvas.
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
