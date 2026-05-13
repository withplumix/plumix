import type { ComponentType } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

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
const fieldTypes = makeRegistry<PluginFieldComponent>(
  "registerPluginFieldType",
);

function register<TComponent>(
  registry: PluginRegistryEntry<TComponent>,
  key: string,
  component: TComponent,
): void {
  if (registry.map.has(key)) {
    throw new Error(
      `${registry.registerName}: "${key}" is already registered. ` +
        `Two plugins are claiming the same key; rename one.`,
    );
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

// Built-in `inputType` names handled by the host's meta-box-field
// dispatcher. Reserving them prevents two failure modes:
//  - accidental: a plugin author picks "text" for their custom field
//    and silently replaces the host's text input across the whole admin
//  - malicious: a plugin overrides every built-in to harvest form data
// Kept in sync with the dispatcher in
// `packages/admin/src/components/meta-box/meta-box-field.tsx` plus the
// reference renderers (user/userList/entry/entryList/term/termList).
// Plugin-shipped reference types (notably `media`) are NOT in this set
// — the duplicate-detection in `register` already prevents two plugins
// from both claiming the same name.
const RESERVED_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "textarea",
  "number",
  "email",
  "url",
  "password",
  "date",
  "datetime",
  "time",
  "color",
  "range",
  "multiselect",
  "json",
  "richtext",
  "repeater",
  "select",
  "radio",
  "checkbox",
  "user",
  "userList",
  "entry",
  "entryList",
  "term",
  "termList",
]);

export function registerPluginFieldType(
  type: string,
  component: PluginFieldComponent,
): void {
  if (RESERVED_INPUT_TYPES.has(type)) {
    throw new Error(
      `registerPluginFieldType: "${type}" is reserved for built-in renderers. ` +
        `Pick a different inputType for your custom field — see the host's ` +
        `RESERVED_INPUT_TYPES list.`,
    );
  }
  register(fieldTypes, type, component);
}

export function getPluginFieldType(
  type: string,
): PluginFieldComponent | undefined {
  return fieldTypes.map.get(type);
}

/** @internal Test-only. */
export function _resetPluginRegistry(): void {
  pages.map.clear();
  fieldTypes.map.clear();
}
