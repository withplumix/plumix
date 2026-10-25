import type { MessageDescriptor } from "@lingui/core";

import type {
  BlockNode,
  BlockRegistry,
  StylePolicy,
} from "@plumix/core/blocks";
import type { Label } from "@plumix/core/i18n";

import type { LayoutGate } from "./layout-gate.js";
import type { EditorDevice, EditorStoreApi } from "./store.js";
import {
  createNodeFromEntry,
  entryKey,
  groupInsertables,
} from "./block-catalog.js";
import { blockExcerpt } from "./block-excerpt.js";
import {
  canGroupSelection,
  canUngroupBlock,
  findBlock,
  flattenTree,
  topLevelIndexAfter,
} from "./block-tree-ops.js";
import { layoutGate } from "./layout-gate.js";

/** The palette's sections, in the order it renders them. */
export const EDITOR_COMMAND_GROUP_IDS = ["actions", "insert", "goto"] as const;

export type EditorCommandGroupId = (typeof EDITOR_COMMAND_GROUP_IDS)[number];

/** One executable palette entry. `run` closes over the editor state it needs
 *  when the command is built — the shell palette's router-only context can't
 *  supply it. */
export interface EditorCommand {
  readonly id: string;
  readonly group: EditorCommandGroupId;
  readonly title: Label;
  /** A muted second line: a go-to command's block text, to tell blocks of one
   *  type apart. */
  readonly detail?: string;
  /** Extra search terms; a block's own keywords for the insert commands. */
  readonly keywords?: readonly Label[];
  /** A block-icon name, resolved against admin-ui's curated set. */
  readonly icon?: string;
  readonly run: () => void;
}

/** Everything the roster needs to bind its actions to this editor instance. */
export interface EditorCommandContext {
  readonly store: EditorStoreApi;
  readonly registry: BlockRegistry;
  /** Viewer capabilities, gating which blocks the insert commands offer. */
  readonly capabilities: ReadonlySet<string>;
  /** The theme's allowed blocks; undefined allows every block. */
  readonly allowedBlocks?: ReadonlySet<string>;
  /** Hides an insert command whose variation holds a value it refuses. */
  readonly stylePolicy?: StylePolicy;
  /** The current tree, so the go-to commands name the blocks that exist now. */
  readonly tree: readonly BlockNode[];
  /** The entry type being authored, scoping entry-type-bound blocks. */
  readonly entryType?: string;
  /** Opens the host's revision history; the command is offered only with it. */
  readonly openRevisions?: () => void;
  /** Absent grants every layout edit. */
  readonly layout?: LayoutGate;
}

/**
 * Data descriptors carry no call site the extractor sees, so admin mirrors them
 * to pull the ids into its catalog.
 * Guarded by: packages/admin/src/lib/editor-command-i18n.test.ts
 */
export const EDITOR_COMMAND_DESCRIPTORS = {
  xray: {
    id: "editor.command.xray",
    message: "Toggle X-ray outlines",
  },
  group: {
    id: "editor.command.group",
    message: "Group the selection",
  },
  ungroup: {
    id: "editor.command.ungroup",
    message: "Ungroup the selected block",
  },
  deviceDesktop: {
    id: "editor.command.device.desktop",
    message: "Switch to desktop",
  },
  deviceTablet: {
    id: "editor.command.device.tablet",
    message: "Switch to tablet",
  },
  deviceMobile: {
    id: "editor.command.device.mobile",
    message: "Switch to mobile",
  },
  revisions: {
    id: "editor.command.revisions",
    message: "Open revisions",
  },
} as const satisfies Record<string, MessageDescriptor>;

const DEVICES = [
  ["desktop", EDITOR_COMMAND_DESCRIPTORS.deviceDesktop],
  ["tablet", EDITOR_COMMAND_DESCRIPTORS.deviceTablet],
  ["mobile", EDITOR_COMMAND_DESCRIPTORS.deviceMobile],
] as const satisfies readonly (readonly [EditorDevice, Label])[];

/** The editor palette's roster. Rebuilt on every tree change, so the go-to
 *  commands name the blocks the author can actually see. */
export function buildEditorCommands(
  ctx: EditorCommandContext,
): readonly EditorCommand[] {
  const {
    store,
    registry,
    capabilities,
    allowedBlocks,
    stylePolicy,
    tree,
    entryType,
    openRevisions,
    layout = layoutGate(true),
  } = ctx;
  const { selectedIds, activeId } = store.getState();
  const commands: EditorCommand[] = [
    {
      id: "canvas.xray",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.xray,
      run: () => store.getState().toggleXray(),
    },
  ];
  // Dropped rather than inert: a palette row that does nothing reads as broken.
  if (layout.editsLayout && canGroupSelection(tree, selectedIds, registry)) {
    commands.push({
      id: "selection.group",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.group,
      run: () => store.getState().groupSelected(),
    });
  }
  if (
    layout.editsLayout &&
    activeId !== null &&
    canUngroupBlock(tree, activeId, registry)
  ) {
    commands.push({
      id: "selection.ungroup",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.ungroup,
      run: () => store.getState().ungroupSelected(),
    });
  }
  for (const [device, title] of DEVICES) {
    commands.push({
      id: `device.${device}`,
      group: "actions",
      title,
      run: () => store.getState().setDevice(device),
    });
  }
  if (openRevisions) {
    commands.push({
      id: "revisions.open",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.revisions,
      run: openRevisions,
    });
  }
  const insertables = layout.editsLayout
    ? groupInsertables(registry, {
        capabilities,
        themeAllowed: allowedBlocks,
        stylePolicy,
        entryType,
      })
    : [];
  for (const { entries } of insertables) {
    for (const entry of entries) {
      commands.push({
        id: `insert:${entryKey(entry)}`,
        group: "insert",
        title: entry.title,
        // The block name matches too, as it does in the catalog's own search.
        keywords: [entry.name, ...(entry.keywords ?? [])],
        icon: entry.icon,
        run: () => {
          const node = createNodeFromEntry(registry, entry);
          // No drop position, so reveal it; on a drag the author is already
          // looking.
          const { tree: current, activeId } = store.getState();
          store
            .getState()
            .insertBlock(node, topLevelIndexAfter(current, activeId, registry));
          store.getState().revealBlock(node.id);
        },
      });
    }
  }
  for (const node of flattenTree(tree, registry)) {
    const spec = registry.get(node.name);
    if (!layout.selects(spec)) continue;
    const block = findBlock(tree, node.id, registry);
    const detail = block ? blockExcerpt(block, spec) : null;
    commands.push({
      id: `goto:${node.id}`,
      group: "goto",
      title: node.label ?? spec?.title ?? node.name,
      ...(detail ? { detail } : {}),
      keywords: detail ? [node.name, detail] : [node.name],
      icon: spec?.icon,
      run: () => store.getState().revealBlock(node.id),
    });
  }
  return commands;
}

/** Filter the roster by the author's query. `toText` is the caller's i18n-bound
 *  `Label` resolver. */
export function selectEditorCommands(
  commands: readonly EditorCommand[],
  query: string,
  toText: (label: Label) => string,
): readonly EditorCommand[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return commands;
  return commands.filter((command) =>
    [command.title, ...(command.keywords ?? [])]
      .map(toText)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
