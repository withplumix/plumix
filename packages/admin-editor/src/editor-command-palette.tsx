import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";
import { resolveLabel } from "@plumix/core/i18n";

import type { EditorCommand, EditorCommandGroupId } from "./editor-commands.js";
import { BlockIcon } from "./block-icon.js";
import {
  buildEditorCommands,
  EDITOR_COMMAND_GROUP_IDS,
  selectEditorCommands,
} from "./editor-commands.js";
import { useEditorConfig } from "./editor-config-context.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";
import { matchesShortcut } from "./shortcuts.js";

const GROUP_LABELS: Record<EditorCommandGroupId, ReactNode> = {
  actions: <Trans id="editor.palette.group.actions" message="Actions" />,
  insert: <Trans id="editor.palette.group.insert" message="Insert a block" />,
  goto: <Trans id="editor.palette.group.goto" message="Go to a block" />,
};

interface EditorCommandPaletteProps {
  /** The entry type being authored, scoping which blocks can be inserted. */
  readonly entryType?: string;
  /** Opens the host's revision history. */
  readonly onOpenRevisions?: () => void;
}

/**
 * The editor's Cmd/Ctrl+K palette. Keys arrive natively while the shell holds
 * focus, and forwarded over the bridge (`useCanvasKeys`) while the canvas
 * iframe does.
 */
export function EditorCommandPalette({
  entryType,
  onOpenRevisions,
}: EditorCommandPaletteProps): ReactElement {
  const open = useEditorStore((s) => s.paletteOpen);
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // No typing guard, unlike the cheatsheet's printable `?`: Cmd+K types
      // nothing, so it must still reach the palette from the title field or a
      // rich-text body. Toggling matches the admin shell's palette.
      if (event.repeat || !matchesShortcut("palette.open", event)) return;
      // Cmd+K is the browser's own search-bar shortcut.
      event.preventDefault();
      setPaletteOpen(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen, open]);

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>
          <Trans id="editor.palette.title" message="Editor commands" />
        </DialogTitle>
        <DialogDescription>
          <Trans
            id="editor.palette.description"
            message="Search the editor's actions and blocks."
          />
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="overflow-hidden p-0"
        data-testid="plumix-command-palette"
      >
        {/* Mounted only while open, so the roster — which is rebuilt whenever
            the tree changes — costs nothing during ordinary editing. */}
        {open ? (
          <PaletteBody
            entryType={entryType}
            onOpenRevisions={onOpenRevisions}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({
  entryType,
  onOpenRevisions,
}: EditorCommandPaletteProps): ReactElement {
  const { i18n } = useLingui();
  const { registry, capabilities } = useEditorConfig();
  const store = useEditorStoreApi();
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen);
  const tree = useEditorStore((s) => s.tree);
  const [query, setQuery] = useState("");

  const commands = useMemo(
    () =>
      buildEditorCommands({
        store,
        registry,
        capabilities,
        tree,
        entryType,
        openRevisions: onOpenRevisions,
      }),
    [store, registry, capabilities, tree, entryType, onOpenRevisions],
  );
  const visible = selectEditorCommands(commands, query, (label) =>
    resolveLabel(label, i18n),
  );

  // `shouldFilter` is off: the roster is filtered here instead, so a command's
  // `Label` title is matched after i18n resolution and two blocks sharing a
  // name stay distinct rows.
  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        data-testid="plumix-command-palette-input"
        placeholder={i18n._({
          id: "editor.palette.placeholder",
          message: "Type a command…",
        })}
      />
      <CommandList>
        <CommandEmpty>
          <Trans id="editor.palette.empty" message="No commands found." />
        </CommandEmpty>
        {EDITOR_COMMAND_GROUP_IDS.map((group) => {
          const items = visible.filter((command) => command.group === group);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={group} heading={GROUP_LABELS[group]}>
              {items.map((command) => (
                <Item
                  key={command.id}
                  command={command}
                  label={resolveLabel(command.title, i18n)}
                  onRun={() => {
                    setPaletteOpen(false);
                    command.run();
                  }}
                />
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </Command>
  );
}

function Item({
  command,
  label,
  onRun,
}: {
  readonly command: EditorCommand;
  readonly label: string;
  readonly onRun: () => void;
}): ReactElement {
  return (
    <CommandItem
      value={command.id}
      data-testid={`plumix-command-${command.id}`}
      onSelect={onRun}
    >
      {command.icon ? (
        <BlockIcon name={command.icon} className="text-muted-foreground" />
      ) : null}
      <span>{label}</span>
    </CommandItem>
  );
}
