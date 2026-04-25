import type { ComponentType } from "react";

interface PluginRegistryEntry {
  readonly map: Map<string, ComponentType>;
  readonly registerName: string;
}

function makeRegistry(registerName: string): PluginRegistryEntry {
  return { map: new Map(), registerName };
}

const pages = makeRegistry("registerPluginPage");
const blocks = makeRegistry("registerPluginBlock");
const fieldTypes = makeRegistry("registerPluginFieldType");

function register(
  registry: PluginRegistryEntry,
  key: string,
  component: ComponentType,
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

export function registerPluginBlock(
  name: string,
  component: ComponentType,
): void {
  register(blocks, name, component);
}

export function getPluginBlock(name: string): ComponentType | undefined {
  return blocks.map.get(name);
}

export function registerPluginFieldType(
  type: string,
  component: ComponentType,
): void {
  register(fieldTypes, type, component);
}

export function getPluginFieldType(type: string): ComponentType | undefined {
  return fieldTypes.map.get(type);
}

/** @internal Test-only. */
export function _resetPluginRegistry(): void {
  pages.map.clear();
  blocks.map.clear();
  fieldTypes.map.clear();
}
