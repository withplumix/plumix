import type { Mark, Node } from "@tiptap/core";
import type { ComponentType } from "react";

import type { BlockSpec, MarkSpec } from "@plumix/blocks";
import type {
  BlockManifestEntry,
  MarkManifestEntry,
} from "@plumix/core/manifest";

import { AdminPluginRegistryError } from "../lib/errors.js";

interface BlockLookups {
  getBlockSchema(name: string): Node | undefined;
  getBlockEditor(name: string): ComponentType<unknown> | undefined;
}

interface MarkLookups {
  getMarkSchema(name: string): Mark | undefined;
}

interface PluginBlockContribution {
  readonly spec: BlockSpec;
  readonly pluginId: string;
}

interface PluginMarkContribution {
  readonly spec: MarkSpec;
  readonly pluginId: string;
}

// Manifest entries carry no plugin id (they're aggregated from many
// plugins build-side). `registeredBy` surfaces this sentinel on the
// resolved spec; admin code only treats it as opaque.
const PLUGIN_ID_PLACEHOLDER = "manifest";

// `mergeBlockRegistry` awaits `spec.component` to populate
// `ResolvedBlockSpec.component` for the SSR walker. Admin never walks
// (it renders through Tiptap), so a no-op satisfies the contract — and
// surfaces loudly if a caller ever does.
const SSR_COMPONENT_STUB = (): never => {
  throw AdminPluginRegistryError.ssrWalkedAdminSpec();
};

/**
 * Entries without an `adminSchema` ref or without a matching runtime
 * registration are silently dropped — they're either metadata-only
 * sentinels or in a partial-boot state where the plugin admin chunk
 * hasn't run yet.
 */
export function buildPluginBlockContributions(
  entries: readonly BlockManifestEntry[],
  lookups: BlockLookups,
): readonly PluginBlockContribution[] {
  const out: PluginBlockContribution[] = [];
  for (const entry of entries) {
    if (entry.adminSchema === undefined) continue;
    const schema = lookups.getBlockSchema(entry.name);
    if (schema === undefined) continue;
    const editor =
      entry.adminEditor !== undefined
        ? lookups.getBlockEditor(entry.name)
        : undefined;
    const spec: BlockSpec = {
      name: entry.name,
      title: entry.title,
      icon: entry.icon,
      category: entry.category,
      description: entry.description,
      keywords: entry.keywords,
      attributes: entry.attributes,
      supports: entry.supports,
      inserter: entry.inserter,
      variations: entry.variations,
      keyboardShortcuts: entry.keyboardShortcuts,
      markdownShortcuts: entry.markdownShortcuts,
      legacyAliases: entry.legacyAliases,
      schema: () => Promise.resolve(schema),
      component: () => Promise.resolve(SSR_COMPONENT_STUB),
      editor: editor !== undefined ? () => Promise.resolve(editor) : undefined,
    };
    out.push({ spec, pluginId: PLUGIN_ID_PLACEHOLDER });
  }
  return out;
}

/** Same drop-when-unresolvable semantics as `buildPluginBlockContributions`. */
export function buildPluginMarkContributions(
  entries: readonly MarkManifestEntry[],
  lookups: MarkLookups,
): readonly PluginMarkContribution[] {
  const out: PluginMarkContribution[] = [];
  for (const entry of entries) {
    if (entry.adminSchema === undefined) continue;
    const schema = lookups.getMarkSchema(entry.name);
    if (schema === undefined) continue;
    const spec: MarkSpec = {
      name: entry.name,
      title: entry.title,
      description: entry.description,
      keyboardShortcut: entry.keyboardShortcut,
      bubbleMenuLabel: entry.bubbleMenuLabel,
      bubbleMenuIcon: entry.bubbleMenuIcon,
      schema: () => Promise.resolve(schema),
      component: () => Promise.resolve(SSR_COMPONENT_STUB),
    };
    out.push({ spec, pluginId: PLUGIN_ID_PLACEHOLDER });
  }
  return out;
}
