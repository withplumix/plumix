import type { MessageDescriptor } from "@lingui/core";

import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { Label } from "@plumix/core/i18n";

import type { EditorDevice, EditorStoreApi } from "./store.js";
import {
  createNodeFromEntry,
  entryKey,
  groupInsertables,
} from "./block-catalog.js";
import {
  canGroupSelection,
  canUngroupBlock,
  flattenTree,
} from "./block-tree-ops.js";

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
  /** The current tree, so the go-to commands name the blocks that exist now. */
  readonly tree: readonly BlockNode[];
  /** The entry type being authored, scoping entry-type-bound blocks. */
  readonly entryType?: string;
  /** Opens the host's revision history; the command is offered only with it. */
  readonly openRevisions?: () => void;
}

/**
 * The built-in commands' titles. Data descriptors, not JSX, so they carry no
 * call site the extractor can see — admin mirrors them in
 * `lib/editor-command-i18n.ts` (test-guarded for lockstep) to pull the ids into
 * its catalog, the same seam core's manifest labels ride.
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
  const { store, registry, capabilities, tree, entryType, openRevisions } = ctx;
  const { selectedIds, activeId } = store.getState();
  const commands: EditorCommand[] = [
    {
      id: "canvas.xray",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.xray,
      run: () => store.getState().toggleXray(),
    },
  ];
  // Group and ungroup are dropped rather than shown inert: both are no-ops when
  // the selection can't take them, and a palette row that does nothing when
  // picked reads as a broken command.
  if (canGroupSelection(tree, selectedIds)) {
    commands.push({
      id: "selection.group",
      group: "actions",
      title: EDITOR_COMMAND_DESCRIPTORS.group,
      run: () => store.getState().groupSelected(),
    });
  }
  if (activeId !== null && canUngroupBlock(tree, activeId)) {
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
  for (const { entries } of groupInsertables(registry, {
    capabilities,
    entryType,
  })) {
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
          // Appended at the top level: the palette has no drop position, and
          // appending is the one placement that never reorders existing work.
          // Revealing it matters more here than on a drag, where the author is
          // already looking at the drop.
          store.getState().insertBlock(node, store.getState().tree.length);
          store.getState().revealBlock(node.id);
        },
      });
    }
  }
  for (const node of flattenTree(tree)) {
    const spec = registry.get(node.name);
    commands.push({
      id: `goto:${node.id}`,
      group: "goto",
      title: node.label ?? spec?.title ?? node.name,
      keywords: [node.name],
      icon: spec?.icon,
      run: () => store.getState().revealBlock(node.id),
    });
  }
  return commands;
}

/** Filter the roster by the author's query. `toText` is the caller's i18n-bound
 *  `Label` resolver; mirrors the shell palette's `selectCommands`. */
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
